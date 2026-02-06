'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hapticFeedback } from '@tma.js/sdk-react';

import { Page } from '@/components/Page';
import { useAuth } from '@/contexts/AuthContext';
import { signAndExecuteZkLoginTransaction } from '@/lib/zklogin';
import { Transaction } from '@mysten/sui/transactions';
import {
  IntentData,
  EncryptedIntentResult,
  generateIntentId,
  encryptIntent,
  calculateExpiry,
  scalePrice,
  encodePair,
  formatTriggerCondition,
  getDefaultSealConfig,
  getEncryptionStatusMessage,
  PACKAGE_IDS,
} from '@/lib/seal';

// Available trading pairs
const TRADING_PAIRS = [
  { value: 'SUI_USDC', label: 'SUI/USDC', baseDecimals: 9, quoteDecimals: 6 },
  { value: 'DEEP_SUI', label: 'DEEP/SUI', baseDecimals: 6, quoteDecimals: 9 },
  { value: 'DBUSDC_DBUSDT', label: 'USDC/USDT', baseDecimals: 6, quoteDecimals: 6 },
];

// Expiry options in hours
const EXPIRY_OPTIONS = [
  { value: 1, label: '1 Hour' },
  { value: 6, label: '6 Hours' },
  { value: 24, label: '24 Hours' },
  { value: 72, label: '3 Days' },
  { value: 168, label: '7 Days' },
];

export default function CreateIntentPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, session } = useAuth();
  
  // Form state
  const [pair, setPair] = useState('SUI_USDC');
  const [triggerType, setTriggerType] = useState<'price_below' | 'price_above'>('price_below');
  const [triggerValue, setTriggerValue] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [slippageBps, setSlippageBps] = useState(50); // 0.5% default
  const [expiryHours, setExpiryHours] = useState(24);
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'preview' | 'success'>('form');
  const [createdIntentId, setCreatedIntentId] = useState<string | null>(null);
  const [encryptionResult, setEncryptionResult] = useState<EncryptedIntentResult | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const selectedPair = TRADING_PAIRS.find(p => p.value === pair);

  const validateForm = (): string | null => {
    if (!triggerValue || parseFloat(triggerValue) <= 0) {
      return 'Please enter a valid trigger price';
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      return 'Please enter a valid quantity';
    }
    if (slippageBps < 1 || slippageBps > 500) {
      return 'Slippage must be between 0.01% and 5%';
    }
    return null;
  };

  const handlePreview = () => {
    hapticFeedback.impactOccurred.ifAvailable('light');
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      hapticFeedback.notificationOccurred.ifAvailable('error');
      return;
    }
    setError(null);
    setStep('preview');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    hapticFeedback.impactOccurred.ifAvailable('medium');

    try {
      // Generate unique intent ID
      const intentId = generateIntentId();

      // Build intent data
      const intentData: IntentData = {
        intentId,
        pair,
        triggerType,
        triggerValue: parseFloat(triggerValue),
        orderType,
        side,
        quantity: parseFloat(quantity),
        slippageBps,
        expiresAt: Number(calculateExpiry(expiryHours)),
      };

      // Encrypt intent using Seal
      const config = getDefaultSealConfig();
      const encryptedResult = await encryptIntent(intentData, config);

      console.log('Encrypted intent:', {
        intentId: encryptedResult.intentId,
        encryptedBytesLength: encryptedResult.encryptedBytes.length,
        metadata: encryptedResult.metadata,
        verification: encryptedResult.verification,
      });

      // Store the encryption result for display
      setEncryptionResult(encryptedResult);

      // Build and execute on-chain transaction
      const tx = new Transaction();
      
      // Call create_intent on the IntentRegistry contract
      // Note: The Move function requires a Clock object (0x6 is the shared Clock)
      tx.moveCall({
        target: `${PACKAGE_IDS.intentRegistry}::intent_registry::create_intent`,
        arguments: [
          tx.object(PACKAGE_IDS.intentRegistryObject), // Registry shared object
          tx.pure.vector('u8', Array.from(encryptedResult.encryptedBytes)), // Encrypted intent
          tx.pure.u8(triggerType === 'price_below' ? 0 : 1), // Trigger type
          tx.pure.u64(scalePrice(parseFloat(triggerValue))), // Trigger value
          tx.pure.vector('u8', Array.from(encodePair(pair))), // Pair
          tx.pure.u64(calculateExpiry(expiryHours)), // Expiry timestamp
          tx.object('0x6'), // Clock shared object
        ],
      });

      // Check if we have a valid session for transaction signing
      if (!session?.zkProof) {
        throw new Error('Session not ready for signing. Please wait for ZK proof.');
      }

      // Execute the transaction with zkLogin
      console.log('Submitting intent transaction...');
      const result = await signAndExecuteZkLoginTransaction(tx, session);
      
      console.log('Transaction result:', result);

      setCreatedIntentId(intentId);
      setStep('success');
      hapticFeedback.notificationOccurred.ifAvailable('success');
    } catch (err) {
      console.error('Failed to create intent:', err);
      setError(err instanceof Error ? err.message : 'Failed to create intent');
      hapticFeedback.notificationOccurred.ifAvailable('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    hapticFeedback.impactOccurred.ifAvailable('light');
    if (step === 'preview') {
      setStep('form');
    } else {
      router.back();
    }
  };

  if (isLoading || !session) {
    return (
      <Page back={false}>
        <div className="tma-page-centered">
          <div className="tma-spinner" />
        </div>
      </Page>
    );
  }

  // Success view
  if (step === 'success') {
    return (
      <Page back={false}>
        <div className="tma-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
          <div className="animate-fadeIn" style={{ 
            width: 80, 
            height: 80, 
            borderRadius: '50%', 
            background: 'var(--tma-success-bg)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <svg style={{ width: 40, height: 40, color: 'var(--tma-success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Intent Created!</h2>
            <p style={{ color: 'var(--tma-hint-color)', fontSize: 14 }}>
              Your encrypted trading intent has been submitted
            </p>
          </div>

          <div className="tma-card" style={{ width: '100%', maxWidth: 320 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--tma-hint-color)' }}>Pair</span>
              <span style={{ fontWeight: 500 }}>{pair.replace('_', '/')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--tma-hint-color)' }}>Trigger</span>
              <span style={{ fontWeight: 500 }}>
                {triggerType === 'price_below' ? '< ' : '> '}${triggerValue}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--tma-hint-color)' }}>Action</span>
              <span style={{ fontWeight: 500, textTransform: 'uppercase', color: side === 'buy' ? 'var(--tma-success)' : 'var(--tma-error)' }}>
                {side} {quantity} {pair.split('_')[0]}
              </span>
            </div>
          </div>

          {/* Encryption Verification Card */}
          {encryptionResult && (
            <div className="tma-card animate-fadeIn" style={{ 
              width: '100%', 
              maxWidth: 320,
              background: encryptionResult.verification.isRealEncryption 
                ? 'var(--tma-success-bg)' 
                : 'var(--tma-warning-bg)',
              border: `1px solid ${encryptionResult.verification.isRealEncryption 
                ? 'var(--tma-success)' 
                : 'var(--tma-warning)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <svg style={{ 
                  width: 20, 
                  height: 20, 
                  color: encryptionResult.verification.isRealEncryption 
                    ? 'var(--tma-success)' 
                    : 'var(--tma-warning)'
                }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d={encryptionResult.verification.isRealEncryption 
                      ? "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      : "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    }
                  />
                </svg>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {encryptionResult.verification.isRealEncryption 
                    ? 'Seal Encryption Active' 
                    : '[WARN] Mock Encryption (Dev Mode)'}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tma-hint-color)' }}>Method</span>
                  <span style={{ fontFamily: 'monospace' }}>{encryptionResult.verification.encryptionMethod}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tma-hint-color)' }}>Threshold</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {encryptionResult.verification.threshold}/{encryptionResult.verification.keyServerCount}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tma-hint-color)' }}>Encrypted Size</span>
                  <span style={{ fontFamily: 'monospace' }}>{encryptionResult.verification.encryptedSize} bytes</span>
                </div>
                {encryptionResult.verification.isRealEncryption && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--tma-hint-color)' }}>Package</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
                      {encryptionResult.verification.packageId.slice(0, 8)}...{encryptionResult.verification.packageId.slice(-6)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 320 }}>
            <button
              onClick={() => router.push('/intents')}
              className="tma-btn-secondary"
              style={{ flex: 1 }}
            >
              View Intents
            </button>
            <button
              onClick={() => {
                setStep('form');
                setTriggerValue('');
                setQuantity('');
                setEncryptionResult(null);
              }}
              className="tma-btn"
              style={{ flex: 1 }}
            >
              Create Another
            </button>
          </div>
        </div>
      </Page>
    );
  }

  // Preview view
  if (step === 'preview') {
    return (
      <Page back={false}>
        <div className="tma-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <button onClick={handleBack} className="tma-back-btn">
              <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>Confirm Intent</h1>
          </div>

          <div className="tma-card animate-fadeIn">
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--tma-hint-color)' }}>
              Intent Summary
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Trading Pair</span>
                <span style={{ fontWeight: 500 }}>{pair.replace('_', '/')}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Trigger Condition</span>
                <span style={{ fontWeight: 500 }}>
                  Price {triggerType === 'price_below' ? 'drops below' : 'rises above'} ${triggerValue}
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Order Type</span>
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{orderType}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Action</span>
                <span style={{ 
                  fontWeight: 600, 
                  textTransform: 'uppercase',
                  color: side === 'buy' ? 'var(--tma-success)' : 'var(--tma-error)'
                }}>
                  {side} {quantity} {pair.split('_')[0]}
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Slippage Tolerance</span>
                <span style={{ fontWeight: 500 }}>{(slippageBps / 100).toFixed(2)}%</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--tma-hint-color)' }}>Expires In</span>
                <span style={{ fontWeight: 500 }}>
                  {EXPIRY_OPTIONS.find(o => o.value === expiryHours)?.label}
                </span>
              </div>
            </div>
          </div>

          <div className="tma-card animate-fadeIn" style={{ 
            animationDelay: '0.1s',
            background: 'var(--tma-secondary-bg)',
            border: '1px solid var(--tma-border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ 
                width: 32, 
                height: 32, 
                borderRadius: 8,
                background: 'var(--tma-accent-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg style={{ width: 16, height: 16, color: 'var(--tma-accent-color)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <p style={{ fontWeight: 500, marginBottom: 4 }}>End-to-End Encrypted</p>
                <p style={{ fontSize: 13, color: 'var(--tma-hint-color)' }}>
                  Your intent will be encrypted using Seal. Only the secure enclave can decrypt and execute it.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="tma-error-msg animate-fadeIn">
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 'auto', paddingTop: 16 }}>
            <button
              onClick={handleBack}
              className="tma-btn-secondary"
              style={{ flex: 1 }}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              className="tma-btn"
              style={{ flex: 2 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <div className="tma-spinner-small" />
                  Encrypting...
                </span>
              ) : (
                'Create Intent'
              )}
            </button>
          </div>
        </div>
      </Page>
    );
  }

  // Form view
  return (
    <Page back={false}>
      <div className="tma-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button onClick={handleBack} className="tma-back-btn">
            <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>New Trading Intent</h1>
        </div>

        {/* Trading Pair */}
        <div className="tma-form-group animate-fadeIn">
          <label className="tma-label">Trading Pair</label>
          <div className="tma-select-group">
            {TRADING_PAIRS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setPair(p.value); hapticFeedback.selectionChanged.ifAvailable(); }}
                className={`tma-select-btn ${pair === p.value ? 'active' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trigger Condition */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.05s' }}>
          <label className="tma-label">Trigger When Price</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setTriggerType('price_below'); hapticFeedback.selectionChanged.ifAvailable(); }}
              className={`tma-toggle-btn ${triggerType === 'price_below' ? 'active' : ''}`}
              style={{ flex: 1 }}
            >
              <svg style={{ width: 16, height: 16, marginRight: 6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              Drops Below
            </button>
            <button
              onClick={() => { setTriggerType('price_above'); hapticFeedback.selectionChanged.ifAvailable(); }}
              className={`tma-toggle-btn ${triggerType === 'price_above' ? 'active' : ''}`}
              style={{ flex: 1 }}
            >
              <svg style={{ width: 16, height: 16, marginRight: 6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              Rises Above
            </button>
          </div>
        </div>

        {/* Trigger Price */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          <label className="tma-label">Trigger Price (USD)</label>
          <div className="tma-input-wrapper">
            <span className="tma-input-prefix">$</span>
            <input
              type="number"
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
              placeholder="0.00"
              className="tma-input"
              step="0.0001"
              min="0"
            />
          </div>
        </div>

        {/* Side */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.15s' }}>
          <label className="tma-label">Action When Triggered</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setSide('buy'); hapticFeedback.selectionChanged.ifAvailable(); }}
              className={`tma-toggle-btn ${side === 'buy' ? 'active buy' : ''}`}
              style={{ flex: 1 }}
            >
              BUY
            </button>
            <button
              onClick={() => { setSide('sell'); hapticFeedback.selectionChanged.ifAvailable(); }}
              className={`tma-toggle-btn ${side === 'sell' ? 'active sell' : ''}`}
              style={{ flex: 1 }}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.2s' }}>
          <label className="tma-label">Quantity ({pair.split('_')[0]})</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="tma-input"
            step="0.1"
            min="0"
          />
        </div>

        {/* Slippage */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.25s' }}>
          <label className="tma-label">Slippage Tolerance: {(slippageBps / 100).toFixed(2)}%</label>
          <input
            type="range"
            value={slippageBps}
            onChange={(e) => setSlippageBps(parseInt(e.target.value))}
            min="10"
            max="300"
            step="10"
            className="tma-slider"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tma-hint-color)' }}>
            <span>0.1%</span>
            <span>3%</span>
          </div>
        </div>

        {/* Expiry */}
        <div className="tma-form-group animate-fadeIn" style={{ animationDelay: '0.3s' }}>
          <label className="tma-label">Intent Expiry</label>
          <select
            value={expiryHours}
            onChange={(e) => setExpiryHours(parseInt(e.target.value))}
            className="tma-select"
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="tma-error-msg animate-fadeIn">
            {error}
          </div>
        )}

        <button
          onClick={handlePreview}
          className="tma-btn"
          style={{ marginTop: 'auto', paddingTop: 16 }}
        >
          Preview Intent
        </button>
      </div>
    </Page>
  );
}
