import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AccessibilityProfile = 'none' | 'blind' | 'colorBlind' | 'dyslexia' | 'seizure';
export type TextAlignOption = 'left' | 'center' | 'justify';

export interface LanguageOption {
  code: string;
  name: string;
  badge: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', name: 'English (USA)', badge: 'US' },
  { code: 'en-GB', name: 'English (UK)', badge: 'UK' },
  { code: 'es-ES', name: 'Español (ES)', badge: 'ES' },
  { code: 'fr-FR', name: 'Français (FR)', badge: 'FR' },
  { code: 'de-DE', name: 'Deutsch (DE)', badge: 'DE' },
];

export interface AccessibilityState {
  isMenuOpen: boolean;
  activeProfile: AccessibilityProfile;
  profilesExpanded: boolean;
  language: LanguageOption;
  
  // Features
  screenReader: boolean;
  contrastPlus: boolean;
  invertColors: number;       // 0 = Off, 1 = Step 1, 2 = Step 2, 3 = Step 3
  smartContrast: boolean;
  highlightLinks: boolean;
  biggerText: number;         // 0 = 100%, 1 = 120%, 2 = 140%, 3 = 160%
  textSpacing: number;        // 0 = Normal, 1 = Wide, 2 = Extra Wide
  pauseAnimations: boolean;
  hideImages: boolean;
  dyslexiaFriendly: boolean;
  pageStructure: boolean;
  lineHeight: number;         // 0 = Normal, 1 = 1.3x, 2 = 1.6x, 3 = 1.9x
  textAlign: TextAlignOption;
  dictionaryOpen: boolean;
  saturation: number;         // 0 = Normal, 1 = Low, 2 = Monochrome, 3 = High
}

interface AccessibilityContextType extends AccessibilityState {
  hasActiveSettings: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  setProfilesExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
  setLanguage: (lang: LanguageOption) => void;
  selectProfile: (profile: AccessibilityProfile) => void;
  
  // Feature Toggles & Cycles
  toggleScreenReader: () => void;
  toggleContrastPlus: () => void;
  cycleInvertColors: () => void;
  toggleSmartContrast: () => void;
  toggleHighlightLinks: () => void;
  cycleBiggerText: () => void;
  cycleTextSpacing: () => void;
  togglePauseAnimations: () => void;
  toggleHideImages: () => void;
  toggleDyslexiaFriendly: () => void;
  togglePageStructure: () => void;
  cycleLineHeight: () => void;
  cycleTextAlign: () => void;
  toggleDictionary: () => void;
  setDictionaryOpen: (open: boolean) => void;
  cycleSaturation: () => void;

  // Global Actions
  resetAll: () => void;
  speakAnnouncement: (message: string) => void;
}

const STORAGE_KEY = '@mileage_tracker_accessibility_v1';

const defaultState: AccessibilityState = {
  isMenuOpen: false,
  activeProfile: 'none',
  profilesExpanded: true,
  language: SUPPORTED_LANGUAGES[0],
  screenReader: false,
  contrastPlus: false,
  invertColors: 0,
  smartContrast: false,
  highlightLinks: false,
  biggerText: 0,
  textSpacing: 0,
  pauseAnimations: false,
  hideImages: false,
  dyslexiaFriendly: false,
  pageStructure: false,
  lineHeight: 0,
  textAlign: 'left',
  dictionaryOpen: false,
  saturation: 0,
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AccessibilityState>(defaultState);

  // Load persisted preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setState(prev => ({
            ...prev,
            ...parsed,
            isMenuOpen: false, // Never open menu automatically on launch
            dictionaryOpen: false,
          }));
        }
      } catch (err) {
        console.warn('[Accessibility] Failed to load settings:', err);
      }
    })();
  }, []);

  // Save changes to AsyncStorage (excluding menu modal state)
  const persist = useCallback((nextState: AccessibilityState) => {
    try {
      const { isMenuOpen, dictionaryOpen, ...toSave } = nextState;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.warn('[Accessibility] Failed to save settings:', err);
    }
  }, []);

  const speakAnnouncement = useCallback((message: string) => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(message);
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // Ignored on web if not supported
      }
    } else {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, []);

  const openMenu = useCallback(() => {
    setState(prev => ({ ...prev, isMenuOpen: true }));
    speakAnnouncement('Accessibility Menu opened');
  }, [speakAnnouncement]);

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isMenuOpen: false }));
    speakAnnouncement('Accessibility Menu closed');
  }, [speakAnnouncement]);

  const toggleMenu = useCallback(() => {
    setState(prev => {
      const nextOpen = !prev.isMenuOpen;
      speakAnnouncement(nextOpen ? 'Accessibility Menu opened' : 'Accessibility Menu closed');
      return { ...prev, isMenuOpen: nextOpen };
    });
  }, [speakAnnouncement]);

  const setProfilesExpanded = useCallback((expanded: boolean | ((prev: boolean) => boolean)) => {
    setState(prev => {
      const nextVal = typeof expanded === 'function' ? expanded(prev.profilesExpanded) : expanded;
      return { ...prev, profilesExpanded: nextVal };
    });
  }, []);

  const setLanguage = useCallback((lang: LanguageOption) => {
    setState(prev => {
      const updated = { ...prev, language: lang };
      persist(updated);
      speakAnnouncement(`Language set to ${lang.name}`);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const selectProfile = useCallback((profile: AccessibilityProfile) => {
    setState(prev => {
      // Toggle off if clicking the already active profile
      if (prev.activeProfile === profile) {
        const cleared: AccessibilityState = {
          ...prev,
          activeProfile: 'none',
          screenReader: false,
          contrastPlus: false,
          invertColors: 0,
          smartContrast: false,
          highlightLinks: false,
          biggerText: 0,
          textSpacing: 0,
          pauseAnimations: false,
          hideImages: false,
          dyslexiaFriendly: false,
          pageStructure: false,
          lineHeight: 0,
          saturation: 0,
        };
        persist(cleared);
        speakAnnouncement(`${profile} profile deactivated`);
        return cleared;
      }

      let updated: AccessibilityState = { ...prev, activeProfile: profile };

      switch (profile) {
        case 'blind':
          updated = {
            ...updated,
            screenReader: true,
            contrastPlus: true,
            biggerText: 2,
            lineHeight: 1,
            highlightLinks: true,
            pauseAnimations: true,
          };
          speakAnnouncement('Blind accessibility profile activated. Screen reader and high contrast enabled.');
          break;
        case 'colorBlind':
          updated = {
            ...updated,
            smartContrast: true,
            contrastPlus: true,
            saturation: 3, // High saturation
            highlightLinks: true,
          };
          speakAnnouncement('Color blind profile activated. Smart contrast and saturation optimized.');
          break;
        case 'dyslexia':
          updated = {
            ...updated,
            dyslexiaFriendly: true,
            biggerText: 1,
            textSpacing: 2,
            lineHeight: 2,
            highlightLinks: true,
          };
          speakAnnouncement('Dyslexia friendly profile activated. Enhanced font spacing and line height enabled.');
          break;
        case 'seizure':
          updated = {
            ...updated,
            pauseAnimations: true,
            saturation: 1, // Low saturation
            contrastPlus: false,
            invertColors: 0,
          };
          speakAnnouncement('Seizure and epileptic profile activated. Animations paused and contrast softened.');
          break;
      }

      persist(updated);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  // Feature Toggles & Multi-Step Cycles
  const toggleScreenReader = useCallback(() => {
    setState(prev => {
      const next = !prev.screenReader;
      const updated = { ...prev, screenReader: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Screen Reader enabled' : 'Screen Reader disabled');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleContrastPlus = useCallback(() => {
    setState(prev => {
      const next = !prev.contrastPlus;
      const updated = { ...prev, contrastPlus: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Contrast Plus enabled' : 'Contrast Plus disabled');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const cycleInvertColors = useCallback(() => {
    setState(prev => {
      // 0 -> 1 -> 2 -> 3 -> 0
      const next = (prev.invertColors + 1) % 4;
      const updated = { ...prev, invertColors: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(`Invert Colors level ${next}`);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleSmartContrast = useCallback(() => {
    setState(prev => {
      const next = !prev.smartContrast;
      const updated = { ...prev, smartContrast: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Smart Contrast enabled' : 'Smart Contrast disabled');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleHighlightLinks = useCallback(() => {
    setState(prev => {
      const next = !prev.highlightLinks;
      const updated = { ...prev, highlightLinks: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Highlight Links enabled' : 'Highlight Links disabled');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const cycleBiggerText = useCallback(() => {
    setState(prev => {
      // 0 (100%), 1 (120%), 2 (140%), 3 (160%), 0
      const next = (prev.biggerText + 1) % 4;
      const updated = { ...prev, biggerText: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      const labels = ['100% normal', '120% larger', '140% large', '160% maximum'];
      speakAnnouncement(`Text size set to ${labels[next]}`);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const cycleTextSpacing = useCallback(() => {
    setState(prev => {
      // 0 (normal), 1 (wide), 2 (extra wide), 0
      const next = (prev.textSpacing + 1) % 3;
      const updated = { ...prev, textSpacing: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      const labels = ['Normal spacing', 'Wide spacing', 'Extra wide spacing'];
      speakAnnouncement(`Text spacing: ${labels[next]}`);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const togglePauseAnimations = useCallback(() => {
    setState(prev => {
      const next = !prev.pauseAnimations;
      const updated = { ...prev, pauseAnimations: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Animations paused' : 'Animations resumed');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleHideImages = useCallback(() => {
    setState(prev => {
      const next = !prev.hideImages;
      const updated = { ...prev, hideImages: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Images hidden for text clarity' : 'Images visible');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleDyslexiaFriendly = useCallback(() => {
    setState(prev => {
      const next = !prev.dyslexiaFriendly;
      const updated = { ...prev, dyslexiaFriendly: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Dyslexia Friendly font enabled' : 'Dyslexia Friendly font disabled');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const togglePageStructure = useCallback(() => {
    setState(prev => {
      const next = !prev.pageStructure;
      const updated = { ...prev, pageStructure: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(next ? 'Page Structure landmarks outlined' : 'Page Structure outlines hidden');
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const cycleLineHeight = useCallback(() => {
    setState(prev => {
      // 0 (normal), 1 (1.3x), 2 (1.6x), 3 (1.9x), 0
      const next = (prev.lineHeight + 1) % 4;
      const updated = { ...prev, lineHeight: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      const labels = ['Normal line height', 'Medium line height', 'High line height', 'Maximum line height'];
      speakAnnouncement(labels[next]);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const cycleTextAlign = useCallback(() => {
    setState(prev => {
      const options: TextAlignOption[] = ['left', 'center', 'justify'];
      const currentIndex = options.indexOf(prev.textAlign);
      const next = options[(currentIndex + 1) % options.length];
      const updated = { ...prev, textAlign: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      speakAnnouncement(`Text alignment: ${next}`);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const toggleDictionary = useCallback(() => {
    setState(prev => ({ ...prev, dictionaryOpen: !prev.dictionaryOpen }));
  }, []);

  const setDictionaryOpen = useCallback((open: boolean) => {
    setState(prev => ({ ...prev, dictionaryOpen: open }));
  }, []);

  const cycleSaturation = useCallback(() => {
    setState(prev => {
      // 0 (normal), 1 (low/soft), 2 (monochrome), 3 (high), 0
      const next = (prev.saturation + 1) % 4;
      const updated = { ...prev, saturation: next, activeProfile: 'none' as AccessibilityProfile };
      persist(updated);
      const labels = ['Normal saturation', 'Low saturation', 'Monochrome grayscale', 'High saturation'];
      speakAnnouncement(labels[next]);
      return updated;
    });
  }, [persist, speakAnnouncement]);

  const resetAll = useCallback(() => {
    const cleared: AccessibilityState = {
      ...defaultState,
      language: state.language, // preserve language preference
      isMenuOpen: false,
      dictionaryOpen: false,
    };
    setState(cleared);
    persist(cleared);
    speakAnnouncement('All accessibility settings have been reset to default.');
  }, [state.language, persist, speakAnnouncement]);

  // Determine if any accessibility setting is active (to show checkmark in FAB)
  const hasActiveSettings = useMemo(() => {
    return (
      state.activeProfile !== 'none' ||
      state.screenReader ||
      state.contrastPlus ||
      state.invertColors > 0 ||
      state.smartContrast ||
      state.highlightLinks ||
      state.biggerText > 0 ||
      state.textSpacing > 0 ||
      state.pauseAnimations ||
      state.hideImages ||
      state.dyslexiaFriendly ||
      state.pageStructure ||
      state.lineHeight > 0 ||
      state.textAlign !== 'left' ||
      state.saturation > 0
    );
  }, [state]);

  const contextValue = useMemo(() => ({
    ...state,
    hasActiveSettings,
    openMenu,
    closeMenu,
    toggleMenu,
    setProfilesExpanded,
    setLanguage,
    selectProfile,
    toggleScreenReader,
    toggleContrastPlus,
    cycleInvertColors,
    toggleSmartContrast,
    toggleHighlightLinks,
    cycleBiggerText,
    cycleTextSpacing,
    togglePauseAnimations,
    toggleHideImages,
    toggleDyslexiaFriendly,
    togglePageStructure,
    cycleLineHeight,
    cycleTextAlign,
    toggleDictionary,
    setDictionaryOpen,
    cycleSaturation,
    resetAll,
    speakAnnouncement,
  }), [
    state,
    hasActiveSettings,
    openMenu,
    closeMenu,
    toggleMenu,
    setProfilesExpanded,
    setLanguage,
    selectProfile,
    toggleScreenReader,
    toggleContrastPlus,
    cycleInvertColors,
    toggleSmartContrast,
    toggleHighlightLinks,
    cycleBiggerText,
    cycleTextSpacing,
    togglePauseAnimations,
    toggleHideImages,
    toggleDyslexiaFriendly,
    togglePageStructure,
    cycleLineHeight,
    cycleTextAlign,
    toggleDictionary,
    setDictionaryOpen,
    cycleSaturation,
    resetAll,
    speakAnnouncement,
  ]);

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};
