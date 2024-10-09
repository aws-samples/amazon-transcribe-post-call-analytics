import logging
import boto3
import json
import random
import os
from pydub import AudioSegment
import uuid
import datetime
import streamlit as st
from botocore.exceptions import ClientError

# Initialize Bedrock client
bedrock_client = boto3.client('bedrock-runtime', region_name='us-west-2')
polly_client = boto3.client('polly', region_name='us-west-2')

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def generate_conversation(bedrock_client,
                          model_id,
                          system_prompts,
                          messages,
                          temperature,
                          top_k):
    """
    Sends messages to a model.
    Args:
        bedrock_client: The Boto3 Bedrock runtime client.
        model_id (str): The model ID to use.
        system_prompts (JSON) : The system prompts for the model to use.
        messages (JSON) : The messages to send to the model.
        temperature (float): The temperature parameter for the model.
        top_k (int): The top_k parameter for the model.

    Returns:
        response (JSON): The conversation that the model generated.

    """

    logger.info("Generating message with model %s", model_id)

    # Inference parameters to use.
    inference_config = {"temperature": temperature}
    # Additional inference parameters to use.
    additional_model_fields = {"top_k": top_k}

    # Send the message.
    response = bedrock_client.converse(
        modelId=model_id,
        messages=messages,
        system=system_prompts,
        inferenceConfig=inference_config,
        additionalModelRequestFields=additional_model_fields
    )

    # Log token usage.
    token_usage = response['usage']
    logger.info("Input tokens: %s", token_usage['inputTokens'])
    logger.info("Output tokens: %s", token_usage['outputTokens'])
    logger.info("Total tokens: %s", token_usage['totalTokens'])
    logger.info("Stop reason: %s", response['stopReason'])

    return response['output']['message']['content'][0]['text']

def create_polly_json(dialogue):
    # Define Spanish voices for Polly
    agent_voices = ['Mia']
    customer_voices = ['Andres']
    agent_voice = random.choice(agent_voices)
    customer_voice = random.choice(customer_voices)

    polly_json = []
    for entry in dialogue:
        voice = agent_voice if entry["role"] == "agent" else customer_voice
        polly_json.append({
            "voice": voice,
            "text": entry["text"]
        })
    return polly_json

def add_background_noise(polly_json):
    background_sounds = [
        {"type": "typing", "frequency": 0.3},
        {"type": "office_ambience", "frequency": 0.1},
        {"type": "phone_ring", "frequency": 0.05}
    ]

    enhanced_json = []
    for entry in polly_json:
        enhanced_json.append(entry)
        for sound in background_sounds:
            if random.random() < sound["frequency"]:
                enhanced_json.append({
                    "sound_effect": sound["type"]
                })

    return enhanced_json

def create_audio_with_polly(polly_json, filename):
    # Initialize two mono tracks
    agent_track = AudioSegment.silent(duration=0)
    customer_track = AudioSegment.silent(duration=0)
    
    # Define a pause between turns (e.g., 500 ms)
    pause = AudioSegment.silent(duration=500)
    
    for entry in polly_json:
        if "voice" in entry:
            response = polly_client.synthesize_speech(
                Text=entry["text"],
                OutputFormat='mp3',
                VoiceId=entry["voice"],
                Engine='neural',
                LanguageCode='es-MX'
            )

            with open("temp_audio.mp3", 'wb') as file:
                file.write(response['AudioStream'].read())

            segment = AudioSegment.from_mp3("temp_audio.mp3")

            # Add the segment to the appropriate track with a pause
            if entry["voice"] == 'Mia':  # Assuming Mia is the agent
                agent_track += segment + pause
                customer_track += AudioSegment.silent(duration=len(segment) + len(pause))
            else:
                customer_track += segment + pause
                agent_track += AudioSegment.silent(duration=len(segment) + len(pause))

        elif "sound_effect" in entry:
            sound_file = f"{entry['sound_effect']}.mp3"
            if os.path.exists(sound_file):
                sound = AudioSegment.from_mp3(sound_file)
                # Add sound effect to both tracks
                agent_track += sound
                customer_track += sound

    # Ensure both tracks are exactly the same length
    max_length = max(len(agent_track), len(customer_track))
    agent_track = agent_track.set_frame_rate(44100).set_channels(1)
    customer_track = customer_track.set_frame_rate(44100).set_channels(1)

    # Pad the shorter track with silence
    if len(agent_track) < max_length:
        agent_track += AudioSegment.silent(duration=max_length - len(agent_track))
    elif len(customer_track) < max_length:
        customer_track += AudioSegment.silent(duration=max_length - len(customer_track))

    # Ensure both tracks have the exact same number of frames
    min_frames = min(len(agent_track.get_array_of_samples()), len(customer_track.get_array_of_samples()))
    agent_track = agent_track[:min_frames]
    customer_track = customer_track[:min_frames]

    # Check if both tracks have content
    if len(agent_track) == 0 or len(customer_track) == 0:
        logger.warning("One or both audio tracks are empty. Skipping stereo creation.")
        stereo_audio = agent_track if len(agent_track) > 0 else customer_track
    else:
        # Combine into stereo
        stereo_audio = AudioSegment.from_mono_audiosegments(agent_track, customer_track)

    mp3_filename = filename + ".mp3"
    stereo_audio.export(mp3_filename, format="mp3")
    os.remove("temp_audio.mp3")  # Clean up temporary file

    return mp3_filename

def main():
    st.title("Generate Call Transcripts")

    # Updated to include only Anthropic models
    models = [
        {"provider": "Anthropic", "name": "Claude 3 Sonnet", "version": "1.0", "id": "anthropic.claude-3-sonnet-20240229-v1:0"},
        {"provider": "Anthropic", "name": "Claude 3.5 Sonnet", "version": "1.0", "id": "anthropic.claude-3-5-sonnet-20240620-v1:0"},
        {"provider": "Anthropic", "name": "Claude 3 Haiku", "version": "1.0", "id": "anthropic.claude-3-haiku-20240307-v1:0"},
        {"provider": "Anthropic", "name": "Claude 3 Opus", "version": "1.0", "id": "anthropic.claude-3-opus-20240229-v1:0"}
    ]

    model_id = st.selectbox("Select Model", [model["provider"] + " - " + model["name"] + " (" + model["version"] + ")" for model in models])
    model_id = [model["id"] for model in models if model["provider"] + " - " + model["name"] + " (" + model["version"] + ")" == model_id][0]

    max_tokens = st.slider("Max Tokens", 100, 4096, 2000, 100)
    temperature = st.slider("Temperature", 0.0, 1.0, 0.7, 0.1)
    top_k = st.slider("Top K", 0, 500, 250, 10)
    
    # New slider for number of calls
    num_calls = st.slider("Number of Calls to Generate", 1, 100, 1)

    system_prompt = st.text_area("System Prompt", value="""
    You are an assistant for a telecommunications company helping to generate realistic call transcripts.
    """, height=100)
    
    # Move the prompt and system prompt to pre-filled text fields
    prompt = st.text_area("Prompt", value="""
    Generate a detailed contact center transcript in Spanish for company named AT&T Mexico (wireless provider) with flow of agent, customer back and forth. Be verbose. Randomly choose a telecommunications service issue from billing, account cycle, mobile call issues, data plans issues, balance query issues or general questions. The conversation should include:
    1. Greeting and identification
    2. Problem description by the customer
    3. Troubleshooting steps suggested by the agent
    4. Some back-and-forth dialogue as they work through the issue
    5. Resolution or next steps
    6. Closing of the call
    7. Write the response as formatted as a json array that looks like this:
        [
        {"role": "agent", "text": "Welcome to ATT Mexico billing support. How can I assist you today?"},
        {"role": "customer", "text": "Yes I have a question about my recent mobile phone charges."},
        {"role": "agent", "text": "No problem, I'd be happy to review your mobile billing with you."}
        ]
        It is very important to get the formatting correct. It must be a valid JSON array that consists of only key-value pairs for each turn of the conversation
    8. The agent's name is Mia
    9. The customer's name is Andres
    10. Show only the JSON
    Please make the conversation natural, including some hesitations, interruptions, and casual language where appropriate.
    """, height=200)



    if st.button("Generate"):
        for i in range(num_calls):
            st.write(f"Generating call {i+1} of {num_calls}")
            
            system_prompts = [
                {
                    "text": system_prompt
                }
            ]

            messages = [
                {
                    "role": "user",
                    "content": [{"text": prompt}]
                }
            ]

            # Generate conversation with retry logic
            max_retries = 3
            retry_count = 0
            while retry_count < max_retries:
                transcript = generate_conversation(bedrock_client, model_id, system_prompts, messages, temperature, top_k)

                if transcript is None:
                    st.error(f"Failed to generate transcript for call {i+1}. Skipping to next call.")
                    break

                try:
                    # Parse the transcript into a structured format
                    dialogue = json.loads(transcript)

                    # Create the Polly JSON
                    polly_json = create_polly_json(dialogue)

                    # Add background noise
                    enhanced_polly_json = add_background_noise(polly_json)

                    # Save the JSON to a file
                    json_filename = f"MobilePhone_{uuid.uuid4()}_AGENT_OscarR_DT_{datetime.datetime.now().strftime('%Y-%m-%dT%H-%M-%S')}.json"
                    with open(json_filename, 'w') as f:
                        json.dump(enhanced_polly_json, f, indent=2)
                    st.success(f"Polly JSON for call {i+1} has been saved to {json_filename}")

                    # Create the audio recording
                    audio_filename = create_audio_with_polly(enhanced_polly_json, json_filename.replace(".json", ""))
                    st.success(f"Call recording {i+1} has been created as {audio_filename}")

                    # Display the transcript
                    st.json(dialogue)

                    break  # Break out of the retry loop if successful

                except json.JSONDecodeError as e:
                    st.warning(f"Failed to parse transcript for call {i+1} (attempt {retry_count + 1}): {e}")
                    retry_count += 1

            if retry_count == max_retries:
                st.error(f"Failed to generate a valid transcript for call {i+1} after {max_retries} attempts. Skipping to next call.")

        st.success(f"All {num_calls} calls have been generated.")

if __name__ == "__main__":
    main()