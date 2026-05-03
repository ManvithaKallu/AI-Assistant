# AI Assistant

A full-stack Retrieval-Augmented Generation (RAG) system that enables users to query documents using text and voice.



## Overview

This application allows users to upload documents and interact with them using natural language. It combines semantic retrieval with a language model to generate context-aware responses grounded in document data.

The system supports both chat and voice interaction, with streaming responses and source attribution.



## Features

- Multi-document upload (PDF, TXT)
- Semantic retrieval using FAISS
- Context-aware response generation
- Streaming responses (SSE)
- Voice input and audio output
- Source citations (document + page)
- Session-based document handling



## Architecture

User Input → Frontend (React) → FastAPI → Retrieval (FAISS) → LLM → Streaming Response → UI + Audio



## Tech Stack

**Backend**
- FastAPI
- FAISS
- Python
- Ollama

**Frontend**
- React (Vite)
- Tailwind CSS
- Web Speech API



## Project Structure

AI-Assistant  
├── app.py  
├── rag_engine.py  
├── requirements.txt  
├── frontend/  
└── .gitignore  



## Setup

### Backend
pip install -r requirements.txt  
uvicorn app:app --reload  

### Frontend
cd frontend  
npm install  
npm run dev  



## Engineering Notes

- Uses chunk-based retrieval for relevance and scalability  
- Streaming improves perceived latency  
- Local LLM ensures privacy and offline capability  
- Voice layer enables conversational interaction beyond chat  



## Limitations

- Local vector storage (non-distributed)  
- Single-user session  
- Performance dependent on local environment  
- Limited file format support  



## Future Work

- Persistent vector storage  
- Authentication and multi-user support  
- Retrieval reranking  
- Cloud deployment  



## Author

Manvitha Kallu
