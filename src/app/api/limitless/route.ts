import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Get the API key from headers
    const limitlessApiKey = request.headers.get("x-limitless-api-key");
    
    if (!limitlessApiKey) {
      return new Response(
        JSON.stringify({ error: "Limitless API key is required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const date = searchParams.get("date");
    const limit = searchParams.get("limit") || "10";
    const cursor = searchParams.get("cursor");
    const direction = searchParams.get("direction") || "desc";
    const includeMarkdown = searchParams.get("includeMarkdown") || "true";
    const includeHeadings = searchParams.get("includeHeadings") || "true";

    // Build the Limitless API URL
    let apiUrl = "https://api.limitless.ai/v1/lifelogs";
    const params = new URLSearchParams();
    
    // Add all the parameters
    if (date) {
      params.append("date", date);
    } else {
      if (start) params.append("start", start);
      if (end) params.append("end", end);
    }
    
    params.append("limit", limit);
    params.append("direction", direction);
    params.append("includeMarkdown", includeMarkdown);
    params.append("includeHeadings", includeHeadings);
    
    if (cursor) {
      params.append("cursor", cursor);
    }
    
    if (params.toString()) {
      apiUrl += `?${params.toString()}`;
    }

    // Make the request to Limitless API
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "X-API-Key": limitlessApiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Limitless API Error:", response.status, errorText);
      
      let errorMessage = `Failed to fetch transcriptions (${response.status})`;
      if (response.status === 401) {
        errorMessage = "Invalid API key. Please check your Limitless API key.";
      } else if (response.status === 403) {
        errorMessage = "Access denied. Please check your API key permissions.";
      } else if (response.status === 429) {
        errorMessage = "Rate limit exceeded. Please try again later.";
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Server error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error while fetching transcriptions" 
      }),
      {
        status:500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}