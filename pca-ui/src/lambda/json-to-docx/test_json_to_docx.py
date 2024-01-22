import json
from json_to_docx import handler

def mock_handler():
    # Simulate an event
    with open('test_event.json', 'r') as file:
        event = json.load(file)

    handler(event, None)

# Call the mock handler
mock_handler()