import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Generator, Tuple

import faiss
import numpy as np
import requests
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

try:
    from sentence_transformers import CrossEncoder
except Exception:
    CrossEncoder = None


logger = logging.getLogger(__name__)


class RAGEngine:
    def __init__(self, storage_dir: str = "storage"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)

        self.embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

        self.reranker = None
        if CrossEncoder:
            try:
                self.reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            except Exception as error:
                logger.warning("Reranker unavailable: %s", error)

        self.sessions: Dict[str, Dict] = {}

    def _safe_session_id(self, session_id: Optional[str]) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "_", session_id or "default")

    def _session_dir(self, session_id: str) -> Path:
        path = self.storage_dir / self._safe_session_id(session_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _session_paths(self, session_id: str) -> Dict[str, Path]:
        session_dir = self._session_dir(session_id)
        return {
            "index": session_dir / "index.faiss",
            "chunks": session_dir / "chunks.json",
            "documents": session_dir / "documents.json",
        }

    def _get_session(self, session_id: str) -> Dict:
        session_id = self._safe_session_id(session_id)

        if session_id in self.sessions:
            return self.sessions[session_id]

        paths = self._session_paths(session_id)

        session = {"index": None, "chunks": [], "documents": {}}

        if paths["chunks"].exists():
            with open(paths["chunks"], "r", encoding="utf-8") as file:
                session["chunks"] = json.load(file)

        if paths["documents"].exists():
            with open(paths["documents"], "r", encoding="utf-8") as file:
                session["documents"] = json.load(file)

        if paths["index"].exists() and session["chunks"]:
            session["index"] = faiss.read_index(str(paths["index"]))

        self.sessions[session_id] = session
        return session

    def _save_session(self, session_id: str) -> None:
        session = self._get_session(session_id)
        paths = self._session_paths(session_id)

        with open(paths["chunks"], "w", encoding="utf-8") as file:
            json.dump(session["chunks"], file, ensure_ascii=False, indent=2)

        with open(paths["documents"], "w", encoding="utf-8") as file:
            json.dump(session["documents"], file, ensure_ascii=False, indent=2)

        if session["index"] is not None:
            faiss.write_index(session["index"], str(paths["index"]))

    def load_pdf(self, file_path: str) -> List[Dict]:
        pages = []
        reader = PdfReader(file_path)

        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page": page_number, "text": text})

        return pages

    def load_txt(self, file_path: str) -> List[Dict]:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
            return [{"page": None, "text": file.read()}]

    def generate_upload_summary(self, pages, filename):
        text = " ".join(page.get("text", "") for page in pages)[:8000]

        prompt = f"""
Summarize this uploaded document in a short, clear audio-friendly way.

Rules:
- Keep it under 90 words.
- Mention what the document is about.
- Mention key topics.
- Do not use bullet points.
- Make it sound natural when spoken aloud.

Filename: {filename}

Document text:
{text}

Summary:
"""

        try:
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "llama3.1",
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.2},
                },
                timeout=120,
            )
            response.raise_for_status()
            return response.json().get("response", "").strip()
        except Exception:
            logger.exception("Summary generation failed")
            return "Summary is not available for this document."

    def chunk_pages(
        self,
        pages: List[Dict],
        document_id: str,
        filename: str,
        chunk_size: int = 900,
        overlap: int = 200,
    ) -> List[Dict]:
        chunks = []

        for page in pages:
            text = re.sub(r"\s+", " ", page["text"]).strip()
            start = 0

            while start < len(text):
                chunk_text = text[start:start + chunk_size].strip()

                if chunk_text:
                    chunks.append({
                        "chunk_id": str(uuid.uuid4()),
                        "document_id": document_id,
                        "filename": filename,
                        "page": page["page"],
                        "text": chunk_text,
                    })

                start += chunk_size - overlap

        return chunks

    def add_document(self, session_id: str, filename: str, pages: List[Dict]) -> Dict:
        session = self._get_session(session_id)

        document_id = str(uuid.uuid4())
        chunks = self.chunk_pages(pages, document_id, filename)

        if not chunks:
            raise ValueError("No chunks were created from this document")

        embeddings = self.embedding_model.encode([chunk["text"] for chunk in chunks])
        embeddings = np.array(embeddings).astype("float32")
        faiss.normalize_L2(embeddings)

        dimension = embeddings.shape[1]

        if session["index"] is None:
            session["index"] = faiss.IndexFlatIP(dimension)

        session["index"].add(embeddings)
        session["chunks"].extend(chunks)

        session["documents"][document_id] = {
            "document_id": document_id,
            "filename": filename,
            "total_chunks": len(chunks),
        }

        self._save_session(session_id)
        return session["documents"][document_id]

    def list_documents(self, session_id: str) -> List[Dict]:
        return list(self._get_session(session_id)["documents"].values())

    def extract_keywords(self, question: str) -> List[str]:
        stop_words = {
            "what", "when", "where", "who", "why", "how",
            "is", "are", "was", "were", "a", "an", "the",
            "in", "on", "at", "for", "to", "from", "of", "with",
            "and", "or", "but", "do", "does", "did", "can",
            "document", "pdf", "file",
        }

        words = re.findall(r"[a-zA-Z0-9+#.]+", question.lower())

        return list({
            word for word in words
            if word not in stop_words and len(word) > 1
        })

    def semantic_retrieve(
        self,
        session_id: str,
        question: str,
        document_ids: Optional[List[str]] = None,
        top_k: int = 20,
    ) -> List[Dict]:
        session = self._get_session(session_id)

        if session["index"] is None or not session["chunks"]:
            return []

        question_embedding = self.embedding_model.encode([question])
        question_embedding = np.array(question_embedding).astype("float32")
        faiss.normalize_L2(question_embedding)

        search_k = min(max(top_k * 5, 20), len(session["chunks"]))
        scores, indices = session["index"].search(question_embedding, search_k)

        results = []

        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(session["chunks"]):
                continue

            chunk = session["chunks"][idx]

            if document_ids and chunk["document_id"] not in document_ids:
                continue

            result = chunk.copy()
            result["semantic_score"] = float(score)
            result["keyword_score"] = 0
            result["score"] = float(score)
            results.append(result)

            if len(results) >= top_k:
                break

        return results

    def keyword_retrieve(
        self,
        session_id: str,
        question: str,
        document_ids: Optional[List[str]] = None,
        top_k: int = 20,
    ) -> List[Dict]:
        session = self._get_session(session_id)
        keywords = self.extract_keywords(question)

        if not keywords:
            return []

        scored = []

        for chunk in session["chunks"]:
            if document_ids and chunk["document_id"] not in document_ids:
                continue

            chunk_lower = chunk["text"].lower()
            score = sum(3 for keyword in keywords if keyword in chunk_lower)

            if score > 0:
                result = chunk.copy()
                result["semantic_score"] = 0
                result["keyword_score"] = score
                result["score"] = score
                scored.append(result)

        scored.sort(key=lambda item: item["keyword_score"], reverse=True)
        return scored[:top_k]

    def retrieve(
        self,
        session_id: str,
        question: str,
        document_ids: Optional[List[str]] = None,
        top_k: int = 20,
    ) -> List[Dict]:
        semantic_results = self.semantic_retrieve(session_id, question, document_ids, top_k)
        keyword_results = self.keyword_retrieve(session_id, question, document_ids, top_k)

        combined = {}

        for chunk in keyword_results + semantic_results:
            chunk_id = chunk["chunk_id"]

            if chunk_id not in combined:
                combined[chunk_id] = chunk
            else:
                combined[chunk_id]["semantic_score"] = max(
                    combined[chunk_id].get("semantic_score", 0),
                    chunk.get("semantic_score", 0),
                )
                combined[chunk_id]["keyword_score"] = max(
                    combined[chunk_id].get("keyword_score", 0),
                    chunk.get("keyword_score", 0),
                )

        results = list(combined.values())

        for item in results:
            item["score"] = (
                float(item.get("semantic_score", 0))
                + float(item.get("keyword_score", 0)) * 0.05
            )

        results.sort(key=lambda item: item["score"], reverse=True)
        return self.rerank(question, results[:top_k])[:6]

    def rerank(self, question: str, chunks: List[Dict]) -> List[Dict]:
        if not chunks or not self.reranker:
            return chunks

        try:
            pairs = [(question, chunk["text"]) for chunk in chunks]
            scores = self.reranker.predict(pairs)

            for chunk, score in zip(chunks, scores):
                chunk["rerank_score"] = float(score)

            chunks.sort(key=lambda item: item["rerank_score"], reverse=True)
        except Exception as error:
            logger.warning("Reranking failed: %s", error)

        return chunks

    def build_context(self, chunks: List[Dict]) -> Tuple[str, List[Dict]]:
        context_parts = []
        sources = []

        seen_texts = set()

        for index, chunk in enumerate(chunks, start=1):
            normalized_text = re.sub(r"\s+", " ", chunk["text"]).strip().lower()

            if normalized_text in seen_texts:
                continue

            seen_texts.add(normalized_text)

            page_label = f"Page {chunk['page']}" if chunk.get("page") else "TXT"

            context_parts.append(
                f"Document Name: {chunk['filename']}\n"
                f"Location: {page_label}\n"
                f"Evidence:\n{chunk['text']}"
            )

            sources.append({
                "source_number": len(sources) + 1,
                "document_id": chunk["document_id"],
                "filename": chunk["filename"],
                "page": chunk.get("page"),
                "chunk_id": chunk["chunk_id"],
                "score": round(float(chunk.get("score", 0)), 4),
                "rerank_score": round(float(chunk.get("rerank_score", 0)), 4)
                if "rerank_score" in chunk
                else None,
                "text": chunk["text"],
            })

        return "\n\n---\n\n".join(context_parts), sources

    def clean_answer(self, answer: str) -> str:
        answer = answer.strip()

        # Remove raw copied source headers.
        answer = re.sub(r"\[\s*Source.*?\]", "", answer, flags=re.IGNORECASE)
        answer = re.sub(r"Source\s+\d+\s*[:|].*?(?=\n|$)", "", answer, flags=re.IGNORECASE)

        # Collapse duplicated adjacent words: "for for" -> "for"
        answer = re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", answer, flags=re.IGNORECASE)

        # Collapse duplicated joined words: "RevenueRevenue" -> "Revenue"
        answer = re.sub(r"\b([A-Za-z]{3,})\1\b", r"\1", answer)

        # Clean spacing.
        answer = re.sub(r"\s+", " ", answer).strip()
        answer = answer.replace(" .", ".").replace(" ,", ",")
        answer = answer.replace("$ ", "$")

        return answer

    def ask_ollama(self, question: str, context: str) -> str:
        prompt = f"""
You are a document question-answering assistant.

Answer using ONLY the evidence below.

Important:
- Do NOT copy source headers.
- Do NOT mention "Source 1", "Source 2", or raw source labels.
- Do NOT repeat the same fact.
- Give a direct answer in plain English.
- Add citation only at the end.
- Citation format:
  [Document: filename.pdf, Page 3]
- If the evidence does not contain the answer, say:
  "I could not find this in the uploaded document."

Evidence:
{context}

Question:
{question}

Final Answer:
"""

        try:
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "llama3.1",
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.0,
                        "top_p": 0.8,
                        "repeat_penalty": 1.25,
                    },
                },
                timeout=120,
            )

            response.raise_for_status()
            raw_answer = response.json().get("response", "").strip()
            return self.clean_answer(raw_answer)

        except Exception as error:
            logger.exception("Ollama failed")
            return f"Something went wrong while generating the answer: {str(error)}"

    def stream_text(self, text: str) -> Generator[str, None, None]:
        words = text.split(" ")

        for word in words:
            yield word + " "
            time.sleep(0.015)

    def stream_question(
        self,
        session_id: str,
        question: str,
        document_ids: Optional[List[str]] = None,
    ) -> Tuple[List[Dict], Generator[str, None, None]]:
        chunks = self.retrieve(
            session_id=session_id,
            question=question,
            document_ids=document_ids,
            top_k=20,
        )

        if not chunks:
            return [], self.stream_text("I could not find this in the uploaded document.")

        context, sources = self.build_context(chunks)
        answer = self.ask_ollama(question, context)

        return sources, self.stream_text(answer)