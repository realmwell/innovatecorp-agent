# evaluation/dataset.py
#
# Test scenarios uploaded to LangSmith as a dataset.
# Each example represents a realistic user request with expected
# output characteristics that our evaluators can check against.
#
# Run once to create the dataset:
#   python -m evaluation.dataset

from langsmith import Client

DATASET_NAME = "innovatecorp-grant-research"

# Each scenario: a user request + reference metadata for evaluators.
# We don't hardcode expected grant IDs (they change as grants open/close),
# but we do specify the DOMAIN the grants should relate to and what
# compliance fields must appear.
EXAMPLES = [
    {
        "input": {
            "user_request": "Find federal grants for renewable energy research for InnovateCorp"
        },
        "expected": {
            "domains": ["energy", "renewable", "research"],
            "org_name": "InnovateCorp",
            "compliance_fields": ["SAM.gov", "registration", "eligibility"],
            "report_sections": [
                "Executive Summary",
                "Recommended Grant Opportunities",
                "Eligibility Status",
                "Required Next Steps",
                "Timeline",
            ],
        },
    },
    {
        "input": {
            "user_request": "Search for STEM education grants for TechForward Foundation"
        },
        "expected": {
            "domains": ["STEM", "education", "training"],
            "org_name": "TechForward Foundation",
            "compliance_fields": ["SAM.gov", "registration", "eligibility"],
            "report_sections": [
                "Executive Summary",
                "Recommended Grant Opportunities",
                "Eligibility Status",
                "Required Next Steps",
                "Timeline",
            ],
        },
    },
    {
        "input": {
            "user_request": "Find grants for rural broadband infrastructure for ConnectAmerica Inc"
        },
        "expected": {
            "domains": ["broadband", "rural", "infrastructure", "telecom"],
            "org_name": "ConnectAmerica Inc",
            "compliance_fields": ["SAM.gov", "registration", "eligibility"],
            "report_sections": [
                "Executive Summary",
                "Recommended Grant Opportunities",
                "Eligibility Status",
                "Required Next Steps",
                "Timeline",
            ],
        },
    },
    {
        "input": {
            "user_request": "Identify cybersecurity research funding for SecureNet Labs"
        },
        "expected": {
            "domains": ["cybersecurity", "security", "research"],
            "org_name": "SecureNet Labs",
            "compliance_fields": ["SAM.gov", "registration", "eligibility"],
            "report_sections": [
                "Executive Summary",
                "Recommended Grant Opportunities",
                "Eligibility Status",
                "Required Next Steps",
                "Timeline",
            ],
        },
    },
    {
        "input": {
            "user_request": "Find environmental cleanup and remediation grants for GreenRestore Nonprofit"
        },
        "expected": {
            "domains": ["environmental", "cleanup", "remediation"],
            "org_name": "GreenRestore Nonprofit",
            "compliance_fields": ["SAM.gov", "registration", "eligibility"],
            "report_sections": [
                "Executive Summary",
                "Recommended Grant Opportunities",
                "Eligibility Status",
                "Required Next Steps",
                "Timeline",
            ],
        },
    },
]


def create_dataset():
    """Upload test scenarios to LangSmith as an evaluation dataset."""
    client = Client()

    # Delete existing dataset if it exists so we can recreate cleanly
    try:
        existing = client.read_dataset(dataset_name=DATASET_NAME)
        client.delete_dataset(dataset_id=existing.id)
        print(f"Deleted existing dataset '{DATASET_NAME}'")
    except Exception:
        pass

    dataset = client.create_dataset(
        dataset_name=DATASET_NAME,
        description="Federal grant research agent test scenarios covering diverse domains and organizations",
    )

    for i, example in enumerate(EXAMPLES, 1):
        client.create_example(
            dataset_id=dataset.id,
            inputs=example["input"],
            outputs=example["expected"],
        )
        print(f"  Added example {i}: {example['input']['user_request'][:60]}...")

    print(f"\nDataset '{DATASET_NAME}' created with {len(EXAMPLES)} examples.")
    print(f"View at: https://smith.langchain.com — Datasets tab")
    return dataset


if __name__ == "__main__":
    create_dataset()
