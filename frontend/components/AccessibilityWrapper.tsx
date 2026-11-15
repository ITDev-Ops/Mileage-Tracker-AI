import React, { useEffect } from 'react';
import { View, StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessibility } from '../context/AccessibilityContext';
import { AccessibilityFAB } from './AccessibilityFAB';
import { AccessibilityMenu } from './AccessibilityMenu';
import { AccessibleDictionaryModal } from './AccessibleDictionaryModal';

interface AccessibilityWrapperProps {
  children: React.ReactNode;
}

export const AccessibilityWrapper: React.FC<AccessibilityWrapperProps> = ({ children }) => {
  const {
    contrastPlus,
    invertColors,
    smartContrast,
    pageStructure,
    saturation,
    biggerText,
    textSpacing,
    lineHeight,
    textAlign,
    dyslexiaFriendly,
    highlightLinks,
    hideImages,
    pauseAnimations,
    screenReader,
    activeProfile,
    speakAnnouncement,
  } = useAccessibility();

  // Dynamic Web Styling Injection
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let styleEl = document.getElementById('a11y-global-dynamic-styles') as HTMLStyleElement;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'a11y-global-dynamic-styles';
        document.head.appendChild(styleEl);
      }

      const rules: string[] = [];

      // 1. Bigger Text
      if (biggerText === 1) {
        rules.push('body, div, span, p, input, button { font-size: 1.15em !important; }');
      } else if (biggerText === 2) {
        rules.push('body, div, span, p, input, button { font-size: 1.30em !important; }');
      } else if (biggerText === 3) {
        rules.push('body, div, span, p, input, button { font-size: 1.48em !important; }');
      }

      // 2. Text Spacing
      if (textSpacing === 1) {
        rules.push('body, div, span, p, input, button { letter-spacing: 0.08em !important; word-spacing: 0.16em !important; }');
      } else if (textSpacing === 2) {
        rules.push('body, div, span, p, input, button { letter-spacing: 0.16em !important; word-spacing: 0.32em !important; }');
      }

      // 3. Line Height
      if (lineHeight === 1) {
        rules.push('body, div, span, p, input, button { line-height: 1.4 !important; }');
      } else if (lineHeight === 2) {
        rules.push('body, div, span, p, input, button { line-height: 1.7 !important; }');
      } else if (lineHeight === 3) {
        rules.push('body, div, span, p, input, button { line-height: 2.0 !important; }');
      }

      // 4. Text Align
      if (textAlign && textAlign !== 'left') {
        rules.push(`p, span, div, input { text-align: ${textAlign} !important; }`);
      }

      // 5. Dyslexia Friendly Font
      if (dyslexiaFriendly) {
        rules.push(`
          body, div, span, p, input, button {
            font-family: 'OpenDyslexic', 'Comic Sans MS', 'Trebuchet MS', sans-serif !important;
            letter-spacing: 0.06em !important;
            word-spacing: 0.15em !important;
          }
        `);
      }

      // 6. Highlight Links & Buttons
      if (highlightLinks) {
        rules.push(`
          a, button, [role="button"], [role="link"], [data-focusable="true"], [data-testid*="btn"] {
            outline: 3px solid #F59E0B !important;
            outline-offset: 2px !important;
            box-shadow: 0 0 10px rgba(245, 158, 11, 0.6) !important;
          }
        `);
      }

      // 7. Hide Images for Text Clarity
      if (hideImages) {
        rules.push(`
          img, [role="img"], image, svg:not([data-icon]) {
            opacity: 0.04 !important;
            filter: grayscale(100%) !important;
          }
        `);
      }

      // 8. Invert Colors
      if (invertColors === 1) {
        rules.push('body { filter: invert(30%) !important; }');
      } else if (invertColors === 2) {
        rules.push('body { filter: invert(70%) !important; }');
      } else if (invertColors === 3) {
        rules.push('body { filter: invert(100%) hue-rotate(180deg) !important; }');
      }

      // 9. Saturation
      if (saturation === 1) {
        rules.push('body { filter: saturate(40%) !important; }');
      } else if (saturation === 2) {
        rules.push('body { filter: grayscale(100%) !important; }');
      } else if (saturation === 3) {
        rules.push('body { filter: saturate(220%) contrast(110%) !important; }');
      }

      // 10. Contrast+
      if (contrastPlus) {
        rules.push(`
          body {
            background-color: #000000 !important;
          }
          * {
            text-shadow: 0 0 0.5px rgba(255,255,255,0.8) !important;
          }
        `);
      }

      styleEl.innerHTML = rules.join('\n');
    }
  }, [
    biggerText,
    textSpacing,
    lineHeight,
    textAlign,
    dyslexiaFriendly,
    highlightLinks,
    hideImages,
    invertColors,
    saturation,
    contrastPlus,
  ]);

  const handleSpeakOverview = () => {
    const activeItems: string[] = [];
    if (activeProfile !== 'none') activeItems.push(`${activeProfile} profile`);
    if (screenReader) activeItems.push('screen reader');
    if (contrastPlus) activeItems.push('contrast plus');
    if (smartContrast) activeItems.push('smart contrast');
    if (invertColors > 0) activeItems.push(`invert colors level ${invertColors}`);
    if (highlightLinks) activeItems.push('highlight links');
    if (biggerText > 0) activeItems.push(`bigger text level ${biggerText}`);
    if (textSpacing > 0) activeItems.push(`text spacing level ${textSpacing}`);
    if (pauseAnimations) activeItems.push('animations paused');
    if (hideImages) activeItems.push('images hidden');
    if (dyslexiaFriendly) activeItems.push('dyslexia friendly font');
    if (pageStructure) activeItems.push('page structure landmarks');
    if (lineHeight > 0) activeItems.push(`line height level ${lineHeight}`);
    if (textAlign !== 'left') activeItems.push(`text aligned ${textAlign}`);
    if (saturation > 0) activeItems.push(`saturation level ${saturation}`);

    const summary = activeItems.length > 0
      ? `Active accessibility features: ${activeItems.join(', ')}.`
      : 'All accessibility settings are currently at default.';

    speakAnnouncement(summary);
  };

  return (
    <View style={styles.rootContainer}>
      {/* Primary App Content */}
      <View style={styles.contentContainer}>
        {children}
      </View>

      {/* Screen Reader Active Banner */}
      {screenReader && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSpeakOverview}
          style={styles.screenReaderBanner}
          accessibilityRole="button"
          accessibilityLabel="Screen Reader Active. Tap to hear active settings."
        >
          <Ionicons name="volume-high" size={16} color="#10B981" />
          <Text style={styles.screenReaderBannerText}>Screen Reader Active · Tap to listen</Text>
        </TouchableOpacity>
      )}

      {/* Highlight Links Golden Focus Perimeter */}
      {highlightLinks && (
        <View pointerEvents="none" style={styles.highlightLinksFrame} />
      )}

      {/* Hide Images Soft Filter */}
      {hideImages && (
        <View pointerEvents="none" style={styles.hideImagesFilter}>
          <View style={styles.hideImagesBadge}>
            <Text style={styles.hideImagesBadgeText}>Text Clarity Mode: Images Suppressed</Text>
          </View>
        </View>
      )}

      {/* Accessible Page Structure Outlines (if enabled) */}
      {pageStructure && (
        <View pointerEvents="none" style={styles.pageStructureOverlay}>
          <View style={styles.structureHeaderTag}>
            <Text style={styles.structureTagText}>LANDMARK: HEADER / NAV</Text>
          </View>
          <View style={styles.structureMainTag}>
            <Text style={styles.structureTagText}>LANDMARK: MAIN CONTENT</Text>
          </View>
          <View style={styles.structureFooterTag}>
            <Text style={styles.structureTagText}>LANDMARK: ACTIONS / TABS</Text>
          </View>
        </View>
      )}

      {/* High Contrast / Smart Contrast tint filter (non-blocking) */}
      {(contrastPlus || smartContrast) && (
        <View
          pointerEvents="none"
          style={smartContrast ? styles.smartContrastFilter : styles.contrastPlusFilter}
        />
      )}

      {/* Invert Colors Overlays (Multi-Level) */}
      {invertColors === 1 && (
        <View pointerEvents="none" style={styles.invertLightFilter} />
      )}
      {invertColors === 2 && (
        <View pointerEvents="none" style={styles.invertMediumFilter} />
      )}
      {invertColors === 3 && (
        <View pointerEvents="none" style={styles.invertHighFilter} />
      )}

      {/* Color Saturation Overlays */}
      {saturation === 1 && (
        <View pointerEvents="none" style={styles.saturationLowFilter} />
      )}
      {saturation === 2 && (
        <View pointerEvents="none" style={styles.saturationGrayscaleFilter} />
      )}
      {saturation === 3 && (
        <View pointerEvents="none" style={styles.saturationHighFilter} />
      )}

      {/* Global Floating Accessibility Button (FAB) */}
      <AccessibilityFAB />

      {/* Full Accessibility Menu Modal */}
      <AccessibilityMenu />

      {/* Accessible Tax & Mileage Dictionary Modal (Standalone Sibling) */}
      <AccessibleDictionaryModal />
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    position: 'relative',
  },
  contentContainer: {
    flex: 1,
  },

  // Screen Reader Active Audio Header Banner
  screenReaderBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#09090B',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#10B981',
    zIndex: 99998,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  screenReaderBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Highlight Links Golden Focus Perimeter
  highlightLinksFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: '#F59E0B',
    zIndex: 99991,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },

  // Hide Images Filter Layer
  hideImagesFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 9, 11, 0.25)',
    zIndex: 99987,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  hideImagesBadge: {
    backgroundColor: '#18181B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#3F3F46',
  },
  hideImagesBadgeText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },

  // Invert Colors Filter Overlays (pointerEvents="none" ensures no touch disruption)
  invertLightFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 2,
    borderColor: '#38BDF8',
    zIndex: 99990,
  },
  invertMediumFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 3,
    borderColor: '#F59E0B',
    zIndex: 99990,
  },
  invertHighFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    borderWidth: 4,
    borderColor: '#EF4444',
    zIndex: 99990,
  },

  // Contrast Filters
  contrastPlusFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    zIndex: 99989,
  },
  smartContrastFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.03)',
    zIndex: 99989,
  },

  // Saturation Filters
  saturationLowFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    zIndex: 99988,
  },
  saturationGrayscaleFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(51, 65, 85, 0.22)',
    borderWidth: 1.5,
    borderColor: '#64748B',
    zIndex: 99988,
  },
  saturationHighFilter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    zIndex: 99988,
  },

  // Page Structure Landmark Overlay
  pageStructureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99995,
    justifyContent: 'space-between',
    padding: 12,
  },
  structureHeaderTag: {
    backgroundColor: 'rgba(30, 58, 138, 0.9)',
    borderColor: '#60A5FA',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: Platform.OS === 'ios' ? 44 : 20,
  },
  structureMainTag: {
    backgroundColor: 'rgba(6, 78, 59, 0.9)',
    borderColor: '#34D399',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  structureFooterTag: {
    backgroundColor: 'rgba(112, 26, 117, 0.9)',
    borderColor: '#E879F9',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: Platform.OS === 'ios' ? 84 : 64,
  },
  structureTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
