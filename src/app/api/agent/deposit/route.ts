/**
 * POST /api/agent/deposit
 * 
 * Submit a deposit tx hash after client-side signing.
 * Called by the website when a user signs a deposit with their NEAR wallet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNearIntentsAPI } from '@/lib/near-intents-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { txHash, depositAddress } = body as {
      txHash: string;
      depositAddress: string;
    };

    if (!txHash || !depositAddress) {
      return NextResponse.json(
        { error: 'txHash and depositAddress are required' },
        { status: 400 }
      );
    }

    // Submit to 1-Click API
    const api = getNearIntentsAPI();
    try {
      await api.submitDepositTx({ txHash, depositAddress });
    } catch (err) {
      console.warn('[Deposit] Failed to submit to 1-Click API:', err);
    }

    return NextResponse.json({
      success: true,
      txHash,
      depositAddress,
      explorerUrl: `https://explorer.near-intents.org/transactions/${depositAddress}`,
      nearBlocksUrl: `https://nearblocks.io/txns/${txHash}`,
    });
  } catch (error) {
    console.error('Deposit submit error:', error);
    return NextResponse.json(
      { error: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
