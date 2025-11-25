import { GoogleGenAI, Type } from "@google/genai";

export const generateRandomLocations = async (): Promise<any[]> => {
  try {
    if (!process.env.API_KEY) {
        console.warn("No API Key available for Gemini");
        return [];
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Generate 10 realistic random cities in Egypt with their approximate Latitude and Longitude.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    CITYNAME: { type: Type.STRING },
                    LATITUDE: { type: Type.NUMBER },
                    LONGITUDE: { type: Type.NUMBER }
                },
                required: ["CITYNAME", "LATITUDE", "LONGITUDE"]
            }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating locations with Gemini:", error);
    return [];
  }
};
