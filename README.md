# AI Assistant: Chat & Talk with Your Documents

## 1. Introduction

AI Assistant is an intelligent, full-stack application that enables users to interact with their documents using both text and voice. The system leverages Retrieval-Augmented Generation (RAG) to provide accurate, context-aware responses grounded in user-uploaded documents.

Unlike traditional chatbots, this application allows users to upload multiple documents and query them conversationally, with responses supported by source citations. Additionally, it integrates voice capabilities, allowing users to speak queries and receive audio responses in real time.

This project demonstrates a production-style implementation of modern AI systems, combining large language models, vector search, and real-time user interfaces.

---

## 2. Objectives

The primary goals of this project are:

- To build a document-based question-answering system using RAG
- To enable both text and voice-based interaction with documents
- To provide real-time streaming responses for improved user experience
- To ensure transparency through source citations
- To create a clean, modern, and user-friendly interface

---

## 3. System Overview

The system consists of two main components:

### Backend (FastAPI)
- Handles document processing, embedding, and retrieval
- Communicates with the language model
- Streams responses to the frontend
- Manages session-based document storage

### Frontend (React)
- Provides an interactive UI for users
- Supports chat and voice modes
- Displays responses and sources
- Plays audio output for AI responses

---

## 4. Key Features

### 4.1 Document Processing
- Supports uploading multiple documents (PDF and TXT)
- Automatically splits documents into chunks
- Generates embeddings for semantic search
- Stores vectors using FAISS

### 4.2 Chat Mode
- Users can type questions
- AI responds with context-aware answers
- Responses are streamed in real-time
- Sources are displayed with document name and page number

### 4.3 Talk Mode (Voice Interaction)
- Users can speak their questions
- Speech is converted to text using browser APIs
- AI responses are spoken aloud
- Includes playback controls:
  - Pause
  - Resume
  - Stop

### 4.4 Audio Experience
- AI responses are played instantly (no waiting for full text)
- Document summaries can be played as audio
- Visual waveform animation during speech

### 4.5 Source Citations
- Every answer is backed by document references
- Displays:
  - Document name
  - Page number
- Improves trust and explainability

### 4.6 Streaming Responses
- Backend streams tokens as they are generated
- Frontend updates UI in real time
- Enhances responsiveness and UX

---

## 5. Technology Stack

### Backend
- FastAPI — API framework
- FAISS — Vector database
- Python — Core programming language
- Ollama — Local large language model

### Frontend
- React (Vite) — UI framework
- Tailwind CSS — Styling
- Web Speech API — Voice input and output

---

## 6. Architecture Workflow

1. User uploads one or more documents
2. Documents are:
   - Parsed
   - Chunked
   - Converted into embeddings
3. Embeddings are stored in FAISS
4. User asks a question (text or voice)
5. System retrieves relevant chunks
6. Context is sent to the language model
7. AI generates response
8. Response is:
   - Streamed to UI
   - Spoken aloud (if in talk mode)
9. Sources are displayed alongside the answer

---

## 7. Project Structure
AI-Assistant/
│
├── app.py # FastAPI application
├── rag_engine.py # RAG logic (retrieval + generation)
├── requirements.txt
│
├── frontend/
│ ├── src/
│ │ ├── App.jsx # Main UI component
│ │ ├── main.jsx
│ │ ├── index.css
│ │
│ ├── index.html
│ ├── package.json
│ └── vite.config.js
│
└── .gitignore

---

## 8. Setup Instructions

### Backend Setup

1. Install dependencies:
pip install -r requirements.txt

2. Start server:
uvicorn app:app --reload

Server runs at:
http://127.0.0.1:8000

---

### Frontend Setup

1. Navigate to frontend:
cd frontend

2. Install dependencies:
npm install

3. Run application:
npm run dev

Frontend runs at:
http://localhost:5173

---

## 9. Use Cases

- Question answering from documents
- Academic study assistant
- Business report analysis
- Voice-based document interaction
- Knowledge retrieval systems

---

## 10. Future Enhancements

- User authentication and multi-user support
- Cloud deployment (AWS, Render, or Railway)
- Improved ranking and retrieval quality
- Advanced UI animations
- Multi-language support
- Document management dashboard

---

## 11. Conclusion

This project demonstrates a complete implementation of a modern AI assistant that combines document intelligence, real-time interaction, and voice capabilities. It reflects practical application of RAG systems and showcases full-stack integration of AI technologies.

---

## 12. Author

Manvitha Kallu

---

## 13. Acknowledgment

This project is built as a learning and development initiative to explore advanced AI system design, including LLM integration, vector databases, and real-time interfaces.

---
