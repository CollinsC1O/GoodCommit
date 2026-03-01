"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

export function useFaceVerification() {
  const { address, isConnected } = useAccount();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !address) {
      setIsVerified(false);
      setIsLoading(false);
      return;
    }

    // Check if user is already verified
    const verified = localStorage.getItem(`fv_verified_${address}`);
    const timestamp = localStorage.getItem(`fv_timestamp_${address}`);
    
    if (verified === 'true' && timestamp) {
      // Optional: Check if verification is still valid (e.g., within 30 days)
      const verifiedDate = parseInt(timestamp);
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      const isStillValid = Date.now() - verifiedDate < thirtyDaysInMs;
      
      setIsVerified(isStillValid);
    } else {
      setIsVerified(false);
    }
    
    setIsLoading(false);
  }, [address, isConnected]);

  const markAsVerified = () => {
    if (address) {
      localStorage.setItem(`fv_verified_${address}`, 'true');
      localStorage.setItem(`fv_timestamp_${address}`, Date.now().toString());
      setIsVerified(true);
    }
  };

  const clearVerification = () => {
    if (address) {
      localStorage.removeItem(`fv_verified_${address}`);
      localStorage.removeItem(`fv_timestamp_${address}`);
      setIsVerified(false);
    }
  };

  return {
    isVerified,
    isLoading,
    markAsVerified,
    clearVerification,
  };
}
