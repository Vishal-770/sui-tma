/**
 * POST /api/agent/chat
 * 
 * Main chat endpoint for the NEAR Intents AI Agent.
 * Accepts a user message, optional wallet addresses, and execution mode.
 * Returns the agent's response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { NearIntentsAgent } from '@/lib/near-intents-agent';

// Agent instances per session (in-memory for simplicity)
// In production, you'd use a proper session store
const agents = new Map<string, NearIntentsAgent>();

function getOrCreateAgent(sessionId: string): NearIntentsAgent {
  let agent = agents.get(sessionId);
  if (!agent) {
    agent = new NearIntentsAgent();
    agents.set(sessionId, agent);

    // Cleanup old sessions (keep last 100)
    if (agents.size > 100) {
      const oldest = agents.keys().next().value;
      if (oldest) agents.delete(oldest);
    }
  }
  return agent;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      userAddress,
      nearAccountId,
      nearPrivateKey,
      executionMode,
      sessionId,
    } = body as {
      message: string;
      userAddress?: string;
      nearAccountId?: string;
      nearPrivateKey?: string;
      executionMode?: 'auto' | 'client-sign' | 'manual';
      sessionId: string;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const agent = getOrCreateAgent(sessionId);
    const response = await agent.processMessage(message.trim(), {
      userAddress,
      nearAccountId,
      nearPrivateKey,
      executionMode,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error('Agent chat error:', error);
    return NextResponse.json(
      {
        message: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      },
      { status: 500 }
    );
  }
}
