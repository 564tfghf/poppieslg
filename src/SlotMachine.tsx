/*
 *  Copyright (c) Michael Kolesidis <michael.kolesidis@gmail.com>
 *  GNU Affero General Public License v3.0
 *
 *  ATTENTION! FREE SOFTWARE
 *  This website is free software (free as in freedom).
 *  If you use any part of this code, you must make your entire project's source code
 *  publicly available under the same license. This applies whether you modify the code
 *  or use it as it is in your own project. This ensures that all modifications and
 *  derivative works remain free software, so that everyone can benefit.
 *  If you are not willing to comply with these terms, you must refrain from using any part of this code.
 *
 *  For full license terms and conditions, you can read the AGPL-3.0 here:
 *  https://www.gnu.org/licenses/agpl-3.0.html
 */

import {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import useGame from './stores/store';
import { useBlockchainGame } from './hooks/useBlockchainGame';
import { useSoundManager } from './hooks/useSoundManager';
import Reel from './Reel';
import Button from './Button';

interface ReelGroup extends THREE.Group {
  reelSegment?: number;
  reelPosition?: number;
  reelSpinUntil?: number;
  reelStopSegment?: number;
}

interface SlotMachineProps {
  value: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7)[];
}

const SlotMachine = forwardRef(({ value }: SlotMachineProps, ref) => {
  const start = useGame((state) => state.start);
  const end = useGame((state) => state.end);
  const addSpin = useGame((state) => state.addSpin);
  const setOutcomePopup = useGame((state) => state.setOutcomePopup);
  const outcomePopup = useGame((state) => state.outcomePopup);

  // Blockchain integration
  const { 
    spin: blockchainSpin, 
    authenticated, 
    getSpinCost,
    isSpinning: blockchainIsSpinning
  } = useBlockchainGame();

  // Sound manager
  const { 
    playClick, 
    playSpin, 
    playMonReward, 
    playBadLuck,
    playWow,
    playReel, 
    stopReel,
    startSpinning,
    stopSpinning
  } = useSoundManager();

  // Get insufficient funds popup state
  const insufficientFundsPopup = useGame((state) => state.insufficientFundsPopup);

  const reelRefs = [
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
    useRef<ReelGroup>(null),
  ];

  // Game state management
  const [gameState, setGameState] = useState<'idle' | 'spinning' | 'waiting-for-popup'>('idle');

  // Main spin function - shows popup immediately with blockchain results
  const spinSlotMachine = async () => {
    if (!authenticated) {
      console.log('❌ Not authenticated');
      return;
    }

    if (gameState !== 'idle') {
      console.log('❌ Cannot spin: Game state is', gameState);
      return;
    }

    if (insufficientFundsPopup) {
      console.log('❌ Cannot spin: Insufficient funds popup is open');
      return;
    }

    if (blockchainIsSpinning) {
      console.log('❌ Cannot spin: Blockchain is already processing');
      return;
    }

    console.log('🚀 Starting blockchain spin');
    
    // Start spin state (reduces background volume)
    startSpinning();
    
    // Play spin sound and start reel sound
    playSpin();
    playReel();
    
    // Lock the game state
    setGameState('spinning');
    
    // Start UI immediately
    start();
    addSpin();

    // Start blockchain spin and get result
    const blockchainResult = await blockchainSpin();
    
    if (blockchainResult) {
      console.log('🎯 Blockchain result received:', blockchainResult);
      
      // Stop reel sound
      stopReel();
      
      // Play outcome sound IMMEDIATELY when we get the result
      if (Number(blockchainResult.monReward) > 0) {
        console.log('💰 Playing MON reward sound immediately');
        playMonReward();
      } else if (blockchainResult.poppiesNftWon || blockchainResult.rarestPending) {
        console.log('🎉 Playing wow sound for NFT outcome immediately');
        playWow();
      } else {
        console.log('😔 Playing bad luck sound immediately');
        playBadLuck();
      }
      
      // Show popup immediately with blockchain results
      setGameState('waiting-for-popup');
      setOutcomePopup({
        combination: blockchainResult.combination,
        monReward: blockchainResult.monReward,
        extraSpins: blockchainResult.extraSpins,
        poppiesNftWon: blockchainResult.poppiesNftWon,
        rarestPending: blockchainResult.rarestPending,
        txHash: blockchainResult.txHash
      });
      
      // End the spinning phase
      end();
    } else {
      console.log('❌ No blockchain result - back to idle');
      stopReel();
      stopSpinning(); // Stop spin state (restore background volume)
      setGameState('idle');
      end();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && gameState === 'idle' && authenticated && !insufficientFundsPopup && !blockchainIsSpinning) {
        event.preventDefault();
        spinSlotMachine();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [gameState, authenticated, insufficientFundsPopup, blockchainIsSpinning]);

  // Reel animation - just for visual effect, doesn't affect outcome
  useFrame(() => {
    if (gameState !== 'spinning') return;

    for (let i = 0; i < reelRefs.length; i++) {
      const reel = reelRefs[i].current;
      if (!reel) continue;

      // ULTRA FAST spinning animation for maximum speed
      reel.rotation.x += 1.2; // Increased from 0.6 to 1.2 for ultra fast visual effect
    }
  });

  // Handle popup dismissal
  useEffect(() => {
    if (gameState === 'waiting-for-popup' && !outcomePopup) {
      console.log('🎰 Popup dismissed - back to idle');
      stopSpinning(); // Stop spin state (restore background volume)
      setGameState('idle');
    }
  }, [gameState, outcomePopup]);

  useImperativeHandle(ref, () => ({
    reelRefs,
  }));

  const [buttonZ, setButtonZ] = useState(0);
  const [buttonY, setButtonY] = useState(-13);
  const [textZ, setTextZ] = useState(1.6);
  const [textY, setTextY] = useState(-14);

  // Can only spin when idle, authenticated, and no insufficient funds popup
  const canSpin = authenticated && gameState === 'idle' && !insufficientFundsPopup;

  // Button text based on game state
  const getButtonText = () => {
    if (!authenticated) return 'CONNECT WALLET';
    
    if (insufficientFundsPopup) return 'INSUFFICIENT FUNDS';
    
    switch (gameState) {
      case 'spinning':
        return 'SPINNING...';
      case 'waiting-for-popup':
        return 'CLOSE POPUP TO CONTINUE';
      case 'idle':
      default:
        return `SPIN (${getSpinCost()})`;
    }
  };

  return (
    <>
      <Reel
        ref={reelRefs[0]}
        value={value[0]}
        map={0}
        position={[-7, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Reel
        ref={reelRefs[1]}
        value={value[1]}
        map={1}
        position={[0, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Reel
        ref={reelRefs[2]}
        value={value[2]}
        map={2}
        position={[7, 0, 0]}
        rotation={[0, 0, 0]}
        scale={[10, 10, 10]}
        reelSegment={0}
      />
      <Button
        scale={[0.055, 0.045, 0.045]}
        position={[0, buttonY, buttonZ]}
        rotation={[-Math.PI / 8, 0, 0]}
        onClick={() => {
          if (canSpin) {
            playClick();
            spinSlotMachine();
          }
        }}
        onPointerDown={() => {
          if (canSpin) {
            setButtonZ(-1);
            setButtonY(-13.5);
          }
        }}
        onPointerUp={() => {
          setButtonZ(0);
          setButtonY(-13);
        }}
      />
      <Text
        color={canSpin ? "white" : "#888"}
        anchorX="center"
        anchorY="middle"
        position={[0, textY, textZ]}
        rotation={[-Math.PI / 8, 0, 0]}
        fontSize={3}
        font="./fonts/nickname.otf"
        onPointerDown={() => {
          if (canSpin) {
            playClick();
            setTextZ(1.3);
            setTextY(-14.1);
          }
        }}
        onPointerUp={() => {
          setTextZ(1.6);
          setTextY(-14);
        }}
      >
        {getButtonText()}
      </Text>
    </>
  );
});

export default SlotMachine;