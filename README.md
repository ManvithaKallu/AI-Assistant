# AI Assistant

A full-stack Retrieval-Augmented Generation (RAG) system that enables users to interact with documents via text and voice.

---

## Overview

This application allows users to upload documents and query them using natural language. It combines semantic retrieval with a language model to generate context-aware responses grounded in document data.

The system supports both chat-based and voice-based interaction, with real-time streaming responses and source attribution.

---

## Features

- Multi-document upload (PDF, TXT)
- Semantic retrieval using FAISS
- Context-aware response generation via LLM
- Streaming responses (Server-Sent Events)
- Voice input (speech-to-text)
- Audio output (text-to-speech)
- Source citations (document + page)
- Session-based document isolation

---

## Architecture
User Input (Text / Voice)
↓
Frontend (React)
↓
FastAPI Backend
↓
Retrieval Layer (FAISS)
↓
Context Construction
↓
LLM (Ollama)
↓
Streaming Response
↓
Frontend Rendering + Audio

---

## System Design

### Document Ingestion
- Extract text from uploaded files
- Split into chunks
- Generate embeddings
- Store in FAISS with metadata

### Query Processing
- Convert speech to text (if applicable)
- Retrieve top-k relevant chunks
- Build prompt using retrieved context
- Generate response using LLM
- Stream tokens to frontend

### Streaming
- Implemented using Server-Sent Events (SSE)
- Enables incremental rendering of responses
- Supports real-time audio playback

---

## Tech Stack

### Backend
- FastAPI
- FAISS
- Python
- Ollama (LLM)

### Frontend
- React (Vite)
- Tailwind CSS
- Web Speech API

---

## Project Structure
AI-Assistant
├── app.py # FastAPI server
├── rag_engine.py # RAG pipeline
├── requirements.txt
├── frontend # React UI
│ ├── src
│ ├── index.html
│ └── package.json
└── .gitignore

---

## Setup

### Backend

```bash
pip install -r requirements.txt
uvicorn app:app --reload
Frontend
cd frontend
npm install
npm run dev

**Key Engineering Decisions**
•	FAISS for efficient local vector search 
•	Chunk-based retrieval to improve relevance and scalability 
•	Streaming responses to reduce perceived latency 
•	Local LLM (Ollama) for privacy and offline capability 
•	Voice interaction layer to extend beyond traditional chat UX

**Limitations**
•	Local FAISS storage (non-distributed) 
•	No authentication (single-user session) 
•	Performance dependent on local environment 
•	Limited file format support 
•	No reranking in retrieval pipeline

**Future Work**
•	Persistent vector storage (cloud-based) 
•	Authentication and multi-user support 
•	Retrieval reranking 
•	Hybrid search (keyword + vector) 
•	Cloud deployment 
•	Improved UI/UX and observability

**Author**
Manvitha Kallu

