import json
json_to_docx =  __import__('json-to-docx')

def mock_handler():
    # Simulate an event
    with open('test_event.json', 'r') as file:
        event = json.load(file)

    json_to_docx.handler(event, None)

# Call the mock handler
mock_handler()