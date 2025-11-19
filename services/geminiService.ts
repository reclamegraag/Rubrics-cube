import { GoogleGenAI, Type } from "@google/genai";
import { CubeTheme } from "../types";

// We use a simpler schema for the color palette
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateCubeTheme = async (prompt: string): Promise<CubeTheme> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a creative color palette for a Rubik's Cube based on this theme: "${prompt}". 
      Return 6 hex codes for the faces (Up, Down, Left, Right, Front, Back) and 1 hex code for the core/frame.
      Ensure high contrast and vibrant colors.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            U: { type: Type.STRING, description: "Hex color for Up face" },
            D: { type: Type.STRING, description: "Hex color for Down face" },
            L: { type: Type.STRING, description: "Hex color for Left face" },
            R: { type: Type.STRING, description: "Hex color for Right face" },
            F: { type: Type.STRING, description: "Hex color for Front face" },
            B: { type: Type.STRING, description: "Hex color for Back face" },
            core: { type: Type.STRING, description: "Hex color for the cube gaps/core" },
          },
          required: ["U", "D", "L", "R", "F", "B", "core"],
        },
      },
    });

    if (response.text) {
      const theme = JSON.parse(response.text) as CubeTheme;
      return theme;
    }
    throw new Error("No response from AI");
  } catch (error) {
    console.error("Gemini Theme Error:", error);
    // Fallback random theme if error
    return {
      U: '#f0f', D: '#0ff', L: '#ff0', R: '#00f', F: '#0f0', B: '#f00', core: '#000'
    };
  }
};
