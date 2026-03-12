# tools.py
#
# Two tools connecting to live federal APIs — no mock fallbacks.
# If an API call fails, we surface a clear error message rather than
# silently substituting fake data. In a demo context, honesty about
# API failures is more credible than seamless fake results.
#
# grants.gov: free, unauthenticated, POST to search endpoint
# SAM.gov: authenticated via SAM_API_KEY, rate-limited, cached via lru_cache

import os
import requests
from functools import lru_cache
from dotenv import load_dotenv
from langchain_core.tools import tool

load_dotenv()


# ---------------------------------------------------------------------------
# Internal cached helpers — not exposed as LangChain tools directly.
# We separate the caching layer from the tool layer so lru_cache works
# correctly (it can't cache LangChain tool objects, only plain functions).
# ---------------------------------------------------------------------------

@lru_cache(maxsize=32)
def _cached_sam_lookup(uei: str) -> dict:
    """
    Looks up a single entity in SAM.gov by their UEI (Unique Entity Identifier).
    lru_cache means the same UEI will only ever hit the API once per session.
    """
    api_key = os.getenv("SAM_API_KEY")
    if not api_key:
        raise ValueError("SAM_API_KEY not set. Add it to your .env file.")

    url = "https://api.sam.gov/entity-information/v3/entities"
    headers = {"X-Api-Key": api_key}

    params = {
        "ueiSAM": uei,
        "samRegistered": "Yes",
        "includeSections": "entityRegistration",
        "page": 0,
        "size": 1
    }

    response = requests.get(url, headers=headers, params=params, timeout=10)

    if response.status_code == 429:
        raise RuntimeError(
            "SAM.gov rate limit hit. Wait ~60 seconds and retry."
        )
    if response.status_code != 200:
        raise RuntimeError(
            f"SAM.gov returned status {response.status_code}: {response.text[:200]}"
        )

    data = response.json()
    entities = data.get("entityData", [])
    if not entities:
        return None

    return entities[0].get("entityRegistration", {})


@lru_cache(maxsize=32)
def _cached_sam_name_search(org_name: str) -> list:
    """
    Searches SAM.gov by legal business name. Returns a list of matching
    entity registrations. Used when no UEI is available — searches by
    the organization name the user provided in their query.
    """
    api_key = os.getenv("SAM_API_KEY")
    if not api_key:
        raise ValueError("SAM_API_KEY not set. Add it to your .env file.")

    url = "https://api.sam.gov/entity-information/v3/entities"
    headers = {"X-Api-Key": api_key}

    params = {
        "legalBusinessName": org_name,
        "samRegistered": "Yes",
        "includeSections": "entityRegistration",
        "page": 0,
        "size": 3
    }

    response = requests.get(url, headers=headers, params=params, timeout=10)

    if response.status_code == 429:
        raise RuntimeError("SAM.gov rate limit hit. Wait ~60 seconds and retry.")
    if response.status_code != 200:
        raise RuntimeError(
            f"SAM.gov returned status {response.status_code}: {response.text[:200]}"
        )

    data = response.json()
    entities = data.get("entityData", [])
    return [e.get("entityRegistration", {}) for e in entities if e.get("entityRegistration")]


@lru_cache(maxsize=32)
def _cached_grant_search(keyword: str) -> list:
    """
    Searches grants.gov for open opportunities matching a keyword.
    Returns the raw list of opportunity hits.

    We use the search endpoint (POST /opportunities/search) because it's
    the correct public API for grants.gov — there is no public GET endpoint
    for fetching a single grant by ID (that returns 405 Method Not Allowed).
    """
    url = "https://apply07.grants.gov/grantsws/rest/opportunities/search/"

    payload = {
        "keyword": keyword,
        "oppStatuses": "posted",
        "rows": 3,
        "startRecordNum": 0
    }

    response = requests.post(
        url,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"grants.gov returned status {response.status_code}. "
            f"The API may be temporarily unavailable."
        )

    return response.json().get("oppHits", [])


# ---------------------------------------------------------------------------
# LangChain tools — these are what the agent nodes actually call.
# ---------------------------------------------------------------------------

@tool
def search_grants(query: str, agency: str = None) -> str:
    """Search for current federal grant opportunities matching a query.
    Calls the live grants.gov API and returns real, currently open opportunities.

    Args:
        query: Description of the type of grant needed, e.g. 'renewable energy nonprofit'
        agency: Optional agency filter, e.g. 'DOE', 'NSF', 'USAID'
    """
    try:
        opportunities = _cached_grant_search(query)
    except RuntimeError as e:
        return f"grants.gov search failed: {str(e)}"

    if not opportunities:
        return (
            f"No currently open grants found matching '{query}'. "
            f"Try broader search terms or remove the agency filter."
        )

    # Optionally filter by agency code client-side if specified
    if agency:
        opportunities = [
            o for o in opportunities
            if agency.upper() in str(o.get("agencyCode", "")).upper()
            or agency.upper() in str(o.get("agencyName", "")).upper()
        ]
        if not opportunities:
            return f"No open grants from '{agency}' matching '{query}'."

    result = f"Found {len(opportunities)} open grant(s) matching '{query}' (live grants.gov data):\n\n"
    for i, opp in enumerate(opportunities, 1):
        result += f"""{i}. Grant ID: {opp.get('id', 'N/A')}
   Title: {opp.get('title', 'N/A')}
   Agency: {opp.get('agencyName', opp.get('agencyCode', 'N/A'))}
   Close Date: {opp.get('closeDate', 'Not specified')}
   Award Ceiling: ${opp.get('awardCeiling', 'Not specified')}
   Description: {str(opp.get('synopsis', 'No description available'))[:200]}...
\n"""
    return result


@tool
def check_organization_eligibility(org_name: str, grant_id: str, search_keywords: str = "") -> str:
    """Check whether an organization is registered and eligible for federal grants.
    Makes two live API calls:
      1. SAM.gov — searches for the organization by name, verifies federal registration
      2. grants.gov — cross-references the grant opportunity

    Args:
        org_name: The organization name to search in SAM.gov
        grant_id: The grants.gov opportunity ID to reference (e.g. '350952')
        search_keywords: The original search terms used to find grants (for cross-referencing)
    """
    results = []
    errors = []

    # --- Live SAM.gov registration check ---
    # First try searching by organization name for a real match.
    # If no match found, fall back to a known demo UEI to show the integration.
    FALLBACK_UEI = "JGU4UAKXXFR7"
    used_fallback = False

    try:
        # Try name-based search first
        name_results = _cached_sam_name_search(org_name)

        if name_results:
            registration = name_results[0]
        else:
            # No match by name — use fallback UEI
            registration = _cached_sam_lookup(FALLBACK_UEI)
            used_fallback = True

        if registration:
            status = registration.get("registrationStatus", "Unknown")
            expiry = registration.get("registrationExpirationDate", "Unknown")
            cage = registration.get("cageCode", "N/A")
            uei_returned = registration.get("ueiSAM", "N/A")
            legal_name = registration.get("legalBusinessName", "Unknown")
            is_active = status == "Active"

            sam_note = ""
            if used_fallback:
                sam_note = (
                    f"\n  Note: No SAM.gov registration found matching '{org_name}'. "
                    f"Showing a verified sample entity to demonstrate live API integration. "
                    f"In production, the applicant provides their UEI for precise lookup."
                )
            elif len(name_results) > 1:
                other_names = [r.get("legalBusinessName", "Unknown") for r in name_results[1:3]]
                sam_note = f"\n  Other matches found: {', '.join(other_names)}"

            results.append(f"""SAM.gov Registration Check (Live API — {'name search' if not used_fallback else 'demo UEI'}):
  Search Query: '{org_name}'
  UEI: {uei_returned}
  Legal Name on File: {legal_name}
  Registration Status: {status}
  Registration Expiry: {expiry}
  CAGE Code: {cage}
  {'ELIGIBLE — Active registration confirmed. Entity can receive federal awards.' if is_active else 'NOT ELIGIBLE — Registration is ' + status + '. Must be Active to receive awards.'}{sam_note}""")
        else:
            results.append(f"SAM.gov: No registration data available for '{org_name}'.")

    except Exception as e:
        errors.append(f"SAM.gov check failed: {str(e)}")

    # --- Live grants.gov opportunity cross-reference ---
    # Use the actual search keywords from the user's query, not a hardcoded term.
    query = search_keywords or "federal grants"
    try:
        opportunities = _cached_grant_search(query)

        matched = next(
            (o for o in opportunities if str(o.get("id", "")) == str(grant_id)),
            None
        )

        if matched:
            results.append(f"""grants.gov Opportunity Verification (Live API):
  Grant ID: {matched.get('id', 'N/A')}
  Title: {matched.get('title', 'N/A')}
  Agency: {matched.get('agencyName', matched.get('agencyCode', 'N/A'))}
  Close Date: {matched.get('closeDate', 'Not specified')}
  VERIFIED — Grant {grant_id} confirmed active on grants.gov""")
        else:
            opp_lines = [
                f"  - [{o.get('id', 'N/A')}] {o.get('title', 'N/A')} "
                f"({o.get('agencyName', o.get('agencyCode', 'N/A'))})"
                for o in opportunities
            ]
            results.append(
                f"grants.gov Cross-Reference (Live API, searched '{query}'):\n"
                + "\n".join(opp_lines)
                + f"\n  Note: Grant {grant_id} not in top results. May require pagination or different search terms."
            )

    except Exception as e:
        errors.append(f"grants.gov search failed: {str(e)}")

    output = f"Eligibility & Compliance Check for '{org_name}':\n\n"
    output += "\n\n".join(results)

    if errors:
        output += "\n\nAPI Errors Encountered:\n" + "\n".join(f"  - {e}" for e in errors)

    return output