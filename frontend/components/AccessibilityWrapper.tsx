import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { useAccessibility } from '../context/AccessibilityContext';
import { AccessibilityFAB } from './AccessibilityFAB';
import { AccessibilityMenu } from './AccessibilityMenu';

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
  } = useAccessibility();

  return (
    <View style={styles.rootContainer}>
      {/* Primary App Content */}
      <View style={styles.contentContainer}>
        {children}
      </View>

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
