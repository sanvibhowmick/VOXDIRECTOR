# Use a lightweight Python 3.11 image
FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Copy your requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your ml-worker directory (including the model folder)
COPY . .

# Hugging Face Spaces expose port 7860 by default
EXPOSE 7860

# Boot up the FastAPI server on the correct port
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]