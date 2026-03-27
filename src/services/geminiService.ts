import { GoogleGenAI, Type } from "@google/genai";
import { InspectionResult } from "../types";

export async function analyzeSolarPanel(base64Image: string): Promise<InspectionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it to your environment variables in the Secrets panel.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Remove data:image/jpeg;base64, prefix if present
  const base64Data = base64Image.split(',')[1] || base64Image;

  try {
    console.log("Initiating Gemini Vision Analysis...");
    
    // Using gemini-3-flash-preview for high reliability in vision tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are an expert solar panel inspector. Analyze the provided image for defects.
              Detect and locate: Cracks, Dust accumulation, Hotspots, Broken cells, and Burn marks.
              
              For each defect:
              - Classify severity: Minor, Moderate, Severe.
              - Provide a specific maintenance recommendation.
              
              Calculate:
              - Overall Health Score (0-100%).
              - Efficiency Loss (percentage).
              - Estimated Energy Loss (kWh/day).
              
              CRITICAL: You MUST return a valid JSON object. Do not include any markdown formatting like \`\`\`json.
              
              Structure:
              {
                "status": "Healthy" | "Defective",
                "healthScore": number (0-100),
                "efficiencyLoss": number (percentage),
                "estimatedEnergyLoss": number (kWh/day),
                "defects": [
                  {
                    "type": "Crack" | "Dust" | "Hotspot" | "Broken Cell" | "Burn Mark",
                    "severity": "Minor" | "Moderate" | "Severe",
                    "confidence": number (0-1),
                    "box_2d": [ymin, xmin, ymax, xmax] (normalized 0-1000),
                    "description": "Brief explanation",
                    "recommendation": "Specific action"
                  }
                ],
                "summary": "Overall assessment",
                "maintenanceRecommendation": "What should be done next"
              }
              If no defects are found, status should be "Healthy", defects array empty, healthScore 100, and efficiencyLoss 0.
              Be precise with bounding boxes.`
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING },
            healthScore: { type: Type.NUMBER },
            efficiencyLoss: { type: Type.NUMBER },
            estimatedEnergyLoss: { type: Type.NUMBER },
            defects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  box_2d: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER }
                  },
                  description: { type: Type.STRING },
                  recommendation: { type: Type.STRING }
                },
                required: ["type", "severity", "confidence", "box_2d", "description", "recommendation"]
              }
            },
            summary: { type: Type.STRING },
            maintenanceRecommendation: { type: Type.STRING }
          },
          required: ["status", "healthScore", "efficiencyLoss", "estimatedEnergyLoss", "defects", "summary", "maintenanceRecommendation"]
        }
      }
    });

    const rawText = response.text;
    console.log("Raw Response Received:", rawText);

    if (!rawText) {
      throw new Error("The AI model returned an empty response. Please try a different image.");
    }

    // Clean the response text in case the model included markdown blocks despite instructions
    const cleanedText = rawText.replace(/```json\n?/, '').replace(/```/, '').trim();
    
    try {
      const result = JSON.parse(cleanedText);
      console.log("Successfully parsed analysis result:", result.status);
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        imageUrl: base64Image,
        ...result
      };
    } catch (parseError) {
      console.error("JSON Parse Error. Raw text was:", cleanedText);
      throw new Error("Failed to parse the AI response. The model might have returned an invalid format.");
    }
  } catch (error: any) {
    console.error("Gemini API Execution Error:", error);
    
    // Handle specific error cases
    if (error.message?.includes("API key not valid")) {
      throw new Error("Invalid API Key. Please check your Gemini API key configuration.");
    }
    if (error.message?.includes("quota")) {
      throw new Error("API Quota exceeded. Please try again later.");
    }
    
    throw new Error(error.message || "An unexpected error occurred during solar panel analysis.");
  }
}
