"""
Flask API server for Emotion Detection from Text
Run: python server.py
Endpoint: POST /predict  { "text": "your text here" }
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import json
import re
import os
import numpy as np

# ── NLTK setup ───────────────────────────────────────────────────────────────
import nltk
nltk.download('stopwords', quiet=True)
nltk.download('wordnet', quiet=True)
nltk.download('omw-1.4', quiet=True)

from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the web app

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR  = os.path.join(BASE_DIR, '..', 'model')

# ── Load artifacts ───────────────────────────────────────────────────────────
print("Loading model artifacts...")

with open(os.path.join(MODEL_DIR, 'tfidf_vectorizer.pkl'), 'rb') as f:
    vectorizer = pickle.load(f)

with open(os.path.join(MODEL_DIR, 'emotion_classifier.pkl'), 'rb') as f:
    model = pickle.load(f)

with open(os.path.join(MODEL_DIR, 'metadata.json'), 'r') as f:
    metadata = json.load(f)

LABEL_MAP      = {int(k): v for k, v in metadata['label_map'].items()}
EMOTION_EMOJIS = metadata['emotion_emojis']
EMOTION_COLORS = metadata['emotion_colors']
NUM_CLASSES    = len(LABEL_MAP)

print(f"✅ Model loaded: {metadata['model_name']}")
print(f"   Accuracy : {metadata['accuracy']*100:.2f}%")
print(f"   Macro F1 : {metadata['macro_f1']:.4f}")

# ── Preprocessing ────────────────────────────────────────────────────────────
lemmatizer = WordNetLemmatizer()
stop_words  = set(stopwords.words('english'))

def preprocess_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'@\w+|#\w+', '', text)
    text = re.sub(r'[^a-z\s]', '', text)
    tokens = text.split()
    tokens = [lemmatizer.lemmatize(t) for t in tokens
              if t not in stop_words and len(t) > 2]
    return ' '.join(tokens)

# ── Routes ───────────────────────────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    text = data.get('text', '').strip()

    if not text:
        return jsonify({'error': 'No text provided'}), 400

    cleaned = preprocess_text(text)

    if not cleaned:
        return jsonify({'error': 'Text too short or no meaningful words found'}), 400

    vec = vectorizer.transform([cleaned])

    pred_label   = int(model.predict(vec)[0])
    pred_emotion = LABEL_MAP[pred_label]

    # Confidence scores
    if hasattr(model, 'predict_proba'):
        probs = model.predict_proba(vec)[0].tolist()
    else:
        scores = model.decision_function(vec)[0]
        exp_s  = np.exp(scores - np.max(scores))
        probs  = (exp_s / exp_s.sum()).tolist()

    emotions_data = [
        {
            'label':      LABEL_MAP[i],
            'emoji':      EMOTION_EMOJIS[LABEL_MAP[i]],
            'color':      EMOTION_COLORS[LABEL_MAP[i]],
            'confidence': round(float(probs[i]) * 100, 2)
        }
        for i in range(NUM_CLASSES)
    ]
    emotions_data.sort(key=lambda x: x['confidence'], reverse=True)

    return jsonify({
        'input_text':       text,
        'primary_emotion':  pred_emotion,
        'primary_emoji':    EMOTION_EMOJIS[pred_emotion],
        'primary_color':    EMOTION_COLORS[pred_emotion],
        'primary_confidence': round(float(probs[pred_label]) * 100, 2),
        'all_emotions':     emotions_data,
        'model_name':       metadata['model_name']
    })


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status':     'ok',
        'model':      metadata['model_name'],
        'accuracy':   metadata['accuracy'],
        'macro_f1':   metadata['macro_f1'],
        'emotions':   list(LABEL_MAP.values())
    })


if __name__ == '__main__':
    print("\n🚀 Starting Emotion Detection API...")
    print("   URL: http://localhost:5000")
    print("   POST /predict  →  {'text': 'your text'}")
    print("   GET  /health   →  model info\n")
    app.run(debug=True, host='0.0.0.0', port=5000)
