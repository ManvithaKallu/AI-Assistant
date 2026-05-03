import json
import logging
import os
import shutil
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from rag_engine import RAGEngine


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Chat With Your Own Data API")

rag = RAGEngine()

UPLOAD_DIR = Path("data")
UPLOAD_DIR.mkdir(exist_ok=True)

MAX_FILE_SIZE_MB = 15
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", ".txt"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1)
    document_ids: Optional[List[str]] = None


def get_session_id(x_session_id: Optional[str] = Header(default="default")) -> str:
    return x_session_id or "default"


def sanitize_filename(filename: str) -> str:
    filename = os.path.basename(filename)
    filename = filename.replace(" ", "_")
    filename = "".join(
        char for char in filename
        if char.isalnum() or char in {"_", "-", "."}
    )

    if not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    return filename


def validate_file(file: UploadFile) -> str:
    filename = sanitize_filename(file.filename or "")
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF and TXT files are supported",
        )

    return filename


@app.get("/")
def health_check():
    return {"message": "RAG backend is running"}


@app.get("/documents")
def list_documents(x_session_id: Optional[str] = Header(default="default")):
    session_id = get_session_id(x_session_id)
    return {"documents": rag.list_documents(session_id)}


@app.delete("/documents")
def clear_documents(x_session_id: Optional[str] = Header(default="default")):
    session_id = get_session_id(x_session_id)
    path = Path("storage") / session_id

    if path.exists():
        shutil.rmtree(path)

    if session_id in rag.sessions:
        del rag.sessions[session_id]

    return {"message": "Documents cleared"}


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    x_session_id: Optional[str] = Header(default="default"),
):
    session_id = get_session_id(x_session_id)
    filename = validate_file(file)

    file_path = UPLOAD_DIR / f"{session_id}_{filename}"

    total_bytes = 0

    try:
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_bytes += len(chunk)

                if total_bytes > MAX_FILE_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Max size is {MAX_FILE_SIZE_MB} MB.",
                    )

                buffer.write(chunk)

        if filename.lower().endswith(".pdf"):
            pages = rag.load_pdf(str(file_path))
        elif filename.lower().endswith(".txt"):
            pages = rag.load_txt(str(file_path))
        else:
            raise HTTPException(
                status_code=400,
                detail="Only PDF and TXT files are supported",
            )

        if not pages:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from this document",
            )

        full_text = " ".join(page.get("text", "") for page in pages)

        if not full_text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from this document",
            )

        document = rag.add_document(
            session_id=session_id,
            filename=filename,
            pages=pages,
        )

        summary = rag.generate_upload_summary(pages, filename)

        return {
            "message": "Document uploaded and indexed successfully",
            "document_id": document["document_id"],
            "filename": filename,
            "total_chunks": document["total_chunks"],
            "summary": summary,
            "session_id": session_id,
        }

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Upload failed")
        raise HTTPException(
            status_code=500,
            detail=f"Upload failed: {str(error)}",
        )


@app.post("/ask/stream")
async def ask_question_stream(
    request: QuestionRequest,
    x_session_id: Optional[str] = Header(default="default"),
):
    session_id = get_session_id(x_session_id)

    try:
        sources, token_generator = rag.stream_question(
            session_id=session_id,
            question=request.question,
            document_ids=request.document_ids,
        )

        def event_stream():
            yield f"event: sources\ndata: {json.dumps(sources)}\n\n"

            for token in token_generator:
                yield f"event: token\ndata: {json.dumps(token)}\n\n"

            yield "event: done\ndata: true\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
        )

    except Exception as error:
        logger.exception("Streaming ask failed")
        raise HTTPException(
            status_code=500,
            detail=f"Streaming failed: {str(error)}",
        )