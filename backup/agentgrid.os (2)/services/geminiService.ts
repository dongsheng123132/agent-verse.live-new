import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// Note: In a real app, calls should go through a backend to protect the API KEY.
// For this demo, we assume the environment variable is injected safely or it's a client-side demo key.
export const getGeminiClient = () => {
  // Safely check for process.env to avoid "Uncaught ReferenceError: process is not defined"
  const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
  
  if (!apiKey) {
      console.warn("Gemini API Key not found");
      return null;
  }
  return new GoogleGenAI({ apiKey });
};