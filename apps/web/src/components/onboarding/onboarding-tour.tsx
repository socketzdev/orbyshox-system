import React, { useState, useEffect } from 'react';
import { ONBOARDING_STEPS } from './onboarding-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

export const OnboardingTour: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const hasCompleted = localStorage.getItem('onboarding_completed');
    if (!hasCompleted) {
      setIsVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      const step = ONBOARDING_STEPS[currentStep];
      if (step.target === 'body') {
        setTargetRect(null);
        return;
      }

      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Alvo ausente (ex.: grupo da sidebar recolhido): limpa a posição
        // anterior em vez de manter um rect obsoleto, que fazia o destaque
        // ficar "preso" sobre um elemento errado.
        setTargetRect(null);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [currentStep, isVisible]);

  if (!isVisible) return null;

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    setIsVisible(false);
  };

  const step = ONBOARDING_STEPS[currentStep];

  // Calculate tooltip position based on targetRect and placement
  let top = '50%';
  let left = '50%';
  let transform = 'translate(-50%, -50%)';

  if (targetRect && step.target !== 'body') {
    switch (step.placement) {
      case 'right':
        top = `${targetRect.top + targetRect.height / 2}px`;
        left = `${targetRect.right + 20}px`;
        transform = 'translate(0, -50%)';
        break;
      case 'left':
        top = `${targetRect.top + targetRect.height / 2}px`;
        left = `${targetRect.left - 20}px`;
        transform = 'translate(-100%, -50%)';
        break;
      case 'top':
        top = `${targetRect.top - 20}px`;
        left = `${targetRect.left + targetRect.width / 2}px`;
        transform = 'translate(-50%, -100%)';
        break;
      case 'bottom':
        top = `${targetRect.bottom + 20}px`;
        left = `${targetRect.left + targetRect.width / 2}px`;
        transform = 'translate(-50%, 0)';
        break;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[99] bg-black/50 pointer-events-auto transition-opacity"
        onClick={(e) => {
          if (e.target === e.currentTarget && step.target === 'body') {
            // Optional: Close on backdrop click if it's the welcome step
          }
        }}
      />

      {/* Target Highlight */}
      {targetRect && step.target !== 'body' && (
        <div 
          className="fixed z-[100] border-2 border-primary rounded pointer-events-none transition-all duration-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
          }}
        />
      )}

      {/* Tooltip Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-desc"
        className="fixed z-[101] transition-all duration-300 max-w-sm w-full px-4"
        style={{ top, left, transform }}
      >
        <Card className="shadow-xl relative border-primary/20">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 text-muted-foreground"
            aria-label="Fechar tour"
            onClick={handleComplete}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardHeader className="pb-3 pt-6">
            <CardTitle id="onboarding-tour-title" className="text-lg">{step.title}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p id="onboarding-tour-desc" className="text-sm text-muted-foreground">{step.description}</p>
          </CardContent>
          <CardFooter className="flex justify-between items-center gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
              >
                {currentStep === ONBOARDING_STEPS.length - 1 ? 'Concluir' : 'Próximo'}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Passo {currentStep + 1} de {ONBOARDING_STEPS.length}
            </div>
          </CardFooter>
        </Card>
      </div>
    </>
  );
};
