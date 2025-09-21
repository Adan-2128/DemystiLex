import os
import threading
import json
import uuid
import io
import hashlib
import logging
import re
from flask import (
    Flask, request, jsonify, redirect, url_for, send_file, render_template, session
)
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import (
    LoginManager, UserMixin, login_user, login_required, logout_user, current_user
)
from dotenv import load_dotenv
from datetime import datetime
from fpdf import FPDF
from io import BytesIO
from flask_session import Session

# --- Library Imports ---
import google.generativeai as genai
from gtts import gTTS
import pdfplumber

# --- Basic Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app = Flask(__name__)

# --- Configuration ---
try:
    load_dotenv('gemini.env')
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_PERMANENT'] = False
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not found in environment variables")
    genai.configure(api_key=GEMINI_API_KEY)
except Exception as e:
    logging.error(f"Configuration Error: {str(e)}")
    raise

Session(app)
TTS_CACHE_DIR = 'tts_cache'
os.makedirs(TTS_CACHE_DIR, exist_ok=True)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- In-Memory Data Stores ---
users = {'user1': {'password_hash': generate_password_hash('password123'), 'username': 'user1'}}
translation_tasks = {}
user_history = {}

class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash

@login_manager.user_loader
def load_user(user_id):
    user_data = users.get(user_id)
    if user_data:
        return User(user_id, user_data['username'], user_data['password_hash'])
    return None

# --- Utility Functions ---
def add_to_history(username, activity_type, content, result=None):
    if username not in user_history:
        user_history[username] = []
    
    history_item = {
        'type': activity_type,
        'content_preview': content[:100] + ('...' if len(content) > 100 else ''),
        'result': result,
        'timestamp': datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    }
    user_history[username].insert(0, history_item)

def extract_text_from_file(file):
    filename = file.filename
    if not filename or not filename.lower().endswith(('.txt', '.pdf')):
        return None, "Unsupported file type."
    file.seek(0)
    text = ""
    try:
        if filename.lower().endswith('.txt'):
            text = file.read().decode('utf-8')
        elif filename.lower().endswith('.pdf'):
            with pdfplumber.open(io.BytesIO(file.read())) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        if not text.strip():
            return None, "Could not extract any text from the document."
        return text, None
    except Exception as e:
        logging.error(f"File extraction failed for {filename}: {str(e)}")
        return None, "Failed to process the file."

def run_translation_task(task_id, user_id, content, languages, is_file):
    try:
        if is_file:
            text_to_translate, error = extract_text_from_file(content)
            if error:
                raise ValueError(error)
        else:
            text_to_translate = content

        language_map = {
            'es': 'Spanish', 'fr': 'French', 'de': 'German',
            'hi': 'Hindi', 'ja': 'Japanese', 'ko': 'Korean',
            'zh-CN': 'Chinese (Simplified)'
        }
        
        translations = {}
        model = genai.GenerativeModel('gemini-1.5-flash')

        for lang_code in languages:
            try:
                lang_name = language_map.get(lang_code, lang_code)
                prompt = f"Translate the following legal document text to {lang_name}. Provide only the translated text as the output:\n\n---\n\n{text_to_translate}"
                response = model.generate_content(prompt)
                translations[lang_code] = {'translated': response.text}
            except Exception as e:
                logging.error(f"Translation to {lang_code} failed: {str(e)}")
                translations[lang_code] = {'error': f"Translation to {lang_name} failed."}

        translation_tasks[task_id] = {'status': 'completed', 'result': {'translations': translations}}
        add_to_history(user_id, 'Translation', text_to_translate, result={'translations': translations})

    except Exception as e:
        logging.error(f"Translation task {task_id} failed entirely: {str(e)}")
        translation_tasks[task_id] = {'status': 'failed', 'result': {'error': str(e)}}

# --- Frontend & Auth Routes ---
@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/demystify')
@login_required
def demystify():
    return render_template('demystify.html')

@app.route('/translate')
@login_required
def translate():
    return render_template('translate.html')

@app.route('/chatbot')
@login_required
def chatbot_page():
    return render_template('chatbot.html')

@app.route('/tools')
@login_required
def tools():
    return render_template('tools.html')

@app.route('/lawyer-links')
@login_required
def lawyer_links():
    return render_template('lawyer_links.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user_data = users.get(username)
        if user_data and check_password_hash(user_data['password_hash'], password):
            
            # --- MODIFIED: Clear any old session data before logging in ---
            session.clear()
            
            user = User(id=username, username=username, password_hash=user_data['password_hash'])
            login_user(user)
            return jsonify({'message': 'Login successful'}), 200
        return jsonify({'error': 'Invalid username or password'}), 401
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if not username or not password:
            return jsonify({'error': 'All fields are required'}), 400
        if username in users:
            return jsonify({'error': 'Username already exists'}), 409
        users[username] = {'password_hash': generate_password_hash(password), 'username': username}
        return jsonify({'message': 'Registration successful'}), 200
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    session.clear()
    logout_user()
    return redirect(url_for('login'))

# --- API Routes ---
@app.route('/api/demystify', methods=['POST'])
@login_required
def demystify_api():
    text, error = extract_text_from_file(request.files['file']) if 'file' in request.files and request.files['file'].filename else (request.form.get('text'), None)
    if error or not text:
        return jsonify({'error': error or 'No text or file provided'}), 400
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        explanation_prompt = f"Explain the following legal text in simple, clear terms for a non-lawyer:\n\n{text}"
        explanation_response = model.generate_content(explanation_prompt)
        mindmap_prompt = f"""Analyze the legal text and generate a concise mind map as a JSON object. Focus on the 4-6 most critical themes. The JSON must have a 'title' and a 'children' array. Example: {{"title": "Summary", "children": [{{"title": "Theme 1"}}]}}. Provide only the JSON object. Text:\n\n{text}"""
        mindmap_response = model.generate_content(mindmap_prompt)
        mindmap_data = json.loads(mindmap_response.text.strip().replace('```json', '').replace('```', ''))
        
        session['document_context'] = text
        add_to_history(current_user.id, 'Demystification', text, result={'explanation': explanation_response.text})

        return jsonify({'explanation': explanation_response.text, 'mindmap_data': mindmap_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/translate', methods=['POST'])
@login_required
def translate_api():
    is_file = 'file' in request.files and request.files['file'].filename != ''
    try:
        if is_file:
            content_file = request.files['file']
            content_bytes = content_file.read()
            content = io.BytesIO(content_bytes)
            content.filename = content_file.filename
            languages = json.loads(request.form.get('languages', '[]'))
        else:
            data = request.get_json()
            content = data.get('text', '')
            languages = data.get('languages', [])
    except (json.JSONDecodeError, KeyError): 
        return jsonify({'error': 'Invalid request format.'}), 400
        
    if not (content if isinstance(content, str) else content.filename) or not languages: 
        return jsonify({'error': 'Missing content or languages.'}), 400
        
    task_id = str(uuid.uuid4())
    translation_tasks[task_id] = {'status': 'processing', 'result': None}
    thread = threading.Thread(target=run_translation_task, args=(task_id, current_user.id, content, languages, is_file))
    thread.start()
    
    return jsonify({'task_id': task_id}), 202

@app.route('/api/translation_status/<task_id>')
@login_required
def get_translation_status(task_id):
    task = translation_tasks.get(task_id)
    return jsonify(task) if task else (jsonify({'status': 'not_found'}), 404)

@app.route('/api/chat', methods=['POST'])
@login_required
def chat_api():
    question = request.get_json().get('question')
    if not question:
        return jsonify({'error': 'No question provided'}), 400
    
    document_context = session.get('document_context')
    
    if document_context:
        prompt = f"""
        SYSTEM INSTRUCTION:
        You are 'LexiCounsel', a specialized AI legal assistant. Your sole purpose is to analyze and answer questions based *strictly* on the legal document provided by the user.
        RULES:
        1.  **Strict Context Adherence:** Base your entire response on the text within the 'DOCUMENT CONTEXT' section. Do not use any external knowledge.
        2.  **No Assumptions:** If the document does not contain the answer, you must state that clearly.
        3.  **Persona:** Maintain a professional, helpful, and neutral tone. Do not give legal advice.
        4.  **Refusal:** If the user's question is unrelated to the document (e.g., general knowledge), politely refuse and state that your function is limited to analyzing the provided text.
        DOCUMENT CONTEXT:\n---\n{document_context}\n---\nUSER'S QUESTION: {question}
        """
    else:
        prompt = f"""
        SYSTEM INSTRUCTION:
        You are 'LexiCounsel', a helpful AI assistant specializing in legal and ethical topics. The user has not provided a specific document.
        RULES:
        1.  **Domain:** Answer the user's question based on your general knowledge of legal principles and ethical frameworks, particularly within the context of India.
        2.  **Disclaimer:** You MUST begin your response with the following disclaimer: "Disclaimer: I am an AI assistant and cannot provide legal advice. The following information is for educational purposes only. Please consult with a qualified professional for any legal concerns."
        3.  **Persona:** Maintain a professional, informative, and neutral tone.
        USER'S QUESTION: {question}
        """
        
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        return jsonify({'response': response.text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/speak', methods=['POST'])
@login_required
def speak_api():
    text = request.get_json().get('text')
    if not text:
        return jsonify({'error': 'No text provided'}), 400

    try:
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        filename = f"{text_hash}.mp3"
        filepath = os.path.join(TTS_CACHE_DIR, filename)

        if not os.path.exists(filepath):
            tts = gTTS(text=text, lang='en', slow=False)
            tts.save(filepath)
        
        return send_file(filepath, mimetype='audio/mpeg')

    except Exception as e:
        logging.error(f"Text-to-speech generation failed: {str(e)}")
        return jsonify({'error': f'Failed to generate audio: {str(e)}'}), 500

@app.route('/api/history')
@login_required
def get_history():
    return jsonify(user_history.get(current_user.id, []))

@app.route('/api/clear_context', methods=['POST'])
@login_required
def clear_context():
    session.pop('document_context', None)
    return jsonify({'message': 'Context cleared'}), 200

# --- Legal Tools API Routes ---
@app.route('/api/verify_estamp', methods=['POST'])
@login_required
def verify_estamp_api():
    text, error = extract_text_from_file(request.files['file']) if 'file' in request.files else (None, "A file is required.")
    if error or not text:
        return jsonify({'error': error or 'No text found in file'}), 400

    uin_pattern = r'IN-[A-Z]{2}\d{12}[A-Z]'
    match = re.search(uin_pattern, text)

    if not match:
        return jsonify({'status': 'not_found', 'reason': 'Could not find a valid E-Stamp Number (UIN) in the document.'})

    uin = match.group(0)
    
    return jsonify({
        'status': 'found',
        'uin': uin,
        'verification_url': 'https://www.shcilestamp.com/eStamp_en/verifyestamp.jsp'
    })

@app.route('/api/compare_clauses', methods=['POST'])
@login_required
def compare_clauses_api():
    data = request.get_json()
    user_document_text = data.get('text')
    if not user_document_text:
        return jsonify({'error': 'Document text is required.'}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
        You are a legal document analyst. Compare the provided "User's Document" against standard principles for a residential rental agreement in India.
        Analyze and identify three categories, responding in a valid JSON format.
        1.  "missing_clauses": A list of important, standard clauses that are absent.
        2.  "risky_clauses": A list of clauses present that seem unfair or risky for a tenant.
        3.  "summary": A brief, one-paragraph overall assessment of the document.
        Standard Principles: Clearly defined parties, property, term, rent, deposit, a reasonable notice period (1-2 months), maintenance responsibilities.
        User's Document:\n---\n{user_document_text}\n---
        Provide a single, valid JSON object with the keys "missing_clauses", "risky_clauses", and "summary".
        """
        response = model.generate_content(prompt)
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        analysis_result = json.loads(cleaned_response)
        return jsonify(analysis_result)
        
    except Exception as e:
        logging.error(f"Clause comparison failed: {str(e)}")
        return jsonify({'error': f'AI analysis failed: {str(e)}'}), 500

@app.route('/api/draft_clause', methods=['POST'])
@login_required
def draft_clause_api():
    data = request.get_json()
    description = data.get('description')
    if not description:
        return jsonify({'error': 'Clause description is required.'}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
        As a legal assistant, draft a standard, clear, and fair legal clause for a rental agreement based on the following user request.
        The clause should be legally sound for a typical residential tenancy in India.
        Provide only the numbered clause text as the output.
        User Request: "{description}"
        """
        response = model.generate_content(prompt)
        clause_number_prefix = "4." 
        return jsonify({'clause': f"{clause_number_prefix} {response.text.strip()}"})

    except Exception as e:
        logging.error(f"Clause drafting failed: {str(e)}")
        return jsonify({'error': f'AI clause drafting failed: {str(e)}'}), 500

@app.route('/draft_pdf', methods=['POST'])
@login_required
def draft_pdf_route():
    data = request.form
    additional_clauses = data.get('additional_clauses', '')

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "RENTAL AGREEMENT", ln=True, align='C')
    pdf.ln(10)

    pdf.set_font("Helvetica", "", 12)
    pdf.multi_cell(0, 8, f"This Rental Agreement is made on this day, {data.get('agreement_date', '_________')},", ln=True)
    pdf.ln(5)
    pdf.multi_cell(0, 8, f"BETWEEN: {data.get('landlord_name', '[Landlord Name]')} (hereinafter referred to as the \"LANDLORD\").", ln=True)
    pdf.ln(5)
    pdf.multi_cell(0, 8, f"AND: {data.get('tenant_name', '[Tenant Name]')} (hereinafter referred to as the \"TENANT\").", ln=True)
    pdf.ln(10)
    pdf.multi_cell(0, 8, f"The landlord agrees to rent to the tenant the property located at: {data.get('property_address', '[Property Address]')}.", ln=True)
    pdf.ln(10)

    pdf.set_font("Helvetica", "B", 12)
    pdf.multi_cell(0, 8, f"1. TERM: The term of this lease shall be for {data.get('term_months', 11)} months.", ln=True)
    pdf.multi_cell(0, 8, f"2. RENT: The monthly rent shall be Rs. {data.get('rent_amount', 0)}/-.", ln=True)
    pdf.multi_cell(0, 8, f"3. DEPOSIT: The tenant has paid a security deposit of Rs. {data.get('deposit_amount', 0)}/-.", ln=True)
    
    if additional_clauses:
        pdf.ln(5)
        pdf.set_font("Helvetica", "", 12)
        pdf.multi_cell(0, 8, additional_clauses, ln=True)

    pdf.ln(20)
    pdf.multi_cell(0, 8, "IN WITNESS WHEREOF, the parties have executed this agreement.", ln=True)
    pdf.ln(20)

    pdf.multi_cell(0, 8, "_________________________")
    pdf.multi_cell(0, 8, f"LANDLORD ({data.get('landlord_name', '')})", ln=True)
    pdf.ln(20)
    pdf.multi_cell(0, 8, "_________________________")
    pdf.multi_cell(0, 8, f"TENANT ({data.get('tenant_name', '')})", ln=True)

    buffer = BytesIO()
    pdf.output(buffer)
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="Rental_Agreement.pdf",
        mimetype="application/pdf"
    )

@app.route('/api/extract_key_dates', methods=['POST'])
@login_required
def extract_key_dates_api():
    if 'file' not in request.files or not request.files['file'].filename:
        return jsonify({'error': 'No file was provided.'}), 400
        
    text, error = extract_text_from_file(request.files['file'])
    if error or not text:
        return jsonify({'error': error or 'No text or file provided'}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""
        Analyze the following legal document and extract all key dates.
        For each date found, identify its legal significance (e.g., "Agreement Start Date", "Lease Expiry Date", "Notice Date").
        Provide the result as a single, valid JSON array of objects, where each object has a "date" and a "significance" key.
        Example: [{{"date": "2024-01-01", "significance": "Effective Start Date"}}]

        --- DOCUMENT TEXT ---
        {text}
        """
        response = model.generate_content(prompt)
        cleaned_response = response.text.strip().replace('```json', '').replace('```', '')
        dates_result = json.loads(cleaned_response)
        
        return jsonify({'key_dates': dates_result})
        
    except Exception as e:
        logging.error(f"Key date extraction failed: {str(e)}")
        return jsonify({'error': f'AI date extraction failed: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)