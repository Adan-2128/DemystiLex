# tasks.py
import os
import threading
import json
import uuid
import io
import hashlib
import logging
from celery import Celery
from dotenv import load_dotenv

# Import your existing utility functions (you might move them to a separate utils.py file)
import google.generativeai as genai
import pdfplumber
import PyPDF2

# --- Celery Configuration ---
# The broker URL points to your running Redis server.
celery = Celery(__name__, broker='redis://localhost:6379/0', backend='redis://localhost:6379/0')

# Load environment variables
load_dotenv('gemini.env')
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# --- Utility Functions (moved from app.py) ---
def extract_text_from_file(file_content, filename):
    text = ""
    try:
        if filename.lower().endswith('.txt'):
            text = file_content.decode('utf-8')
        elif filename.lower().endswith('.pdf'):
            with pdfplumber.open(io.BytesIO(file_content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text: text += page_text + "\n"
        return text, None
    except Exception as e:
        return None, f"File extraction failed: {str(e)}"

def translate_text_with_gemini(text, lang):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"Translate the following text into {lang}. Provide only the translated text:\n\n{text}"
        response = model.generate_content(prompt)
        return response.text.strip(), None
    except Exception as e:
        return None, f"Translation error: {str(e)}"

# --- Celery Task Definition ---
@celery.task
def run_translation_task(username, content_bytes, filename, languages, is_file=False):
    """This is now a Celery task that runs in a separate worker process."""
    error = None
    text_to_translate = None
    if is_file:
        text_to_translate, error = extract_text_from_file(content_bytes, filename)
    else:
        text_to_translate = content_bytes.decode('utf-8')
    
    if error:
        # In Celery, you'd typically handle errors more robustly,
        # but for now, we'll return a dictionary.
        return {'status': 'FAILED', 'result': {'error': error}}

    translations = {}
    for lang in languages:
        translated, err = translate_text_with_gemini(text_to_translate, lang)
        translations[lang] = {'error': err} if err else {'translated': translated}
    
    # The return value of a Celery task is its result.
    return {'status': 'SUCCESS', 'result': {'translations': translations}}