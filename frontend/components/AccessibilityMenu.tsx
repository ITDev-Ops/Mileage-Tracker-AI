import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  StatusBar,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import {
  useAccessibility,
  SUPPORTED_LANGUAGES,
  LanguageOption,
  AccessibilityProfile,
} from '../context/AccessibilityContext';

// Tax & Mileage Dictionary database for the built-in accessible dictionary
const DICTIONARY_ENTRIES: Record<string, string> = {
  'Standard Mileage Rate':
    'The IRS standard amount (67 cents/mile for 2024, 70 cents/mile for 2025/2026) you can deduct for every qualified business mile driven instead of calculating actual car expenses.',
  'Business Trip':
    'A drive taken specifically for work or commercial purposes, such as client meetings, supply runs, job sites, or delivery routes. 100% tax-deductible under IRS rules.',
  'Personal Trip':
    'Everyday personal travel, such as commuting between home and a permanent work office, grocery shopping, or vacation. Not deductible.',
  'Medical Mile':
    'Miles driven for healthcare visits, pharmacy pickups, or doctor appointments. Deductible at the special IRS medical mileage rate (21 cents/mile).',
  'Charity Mile':
    'Miles driven for volunteer work or non-profit organizations. Deductible at a fixed IRS statutory rate (14 cents/mile).',
  'CPA':
    'Certified Public Accountant. A licensed tax professional who prepares and files your tax returns.',
  'Odometer':
    'The dashboard gauge measuring the total cumulative distance your vehicle has traveled over its lifespan.',
  'Auto-Tracking':
    'Automatic GPS trip detection that records departure, arrival, route polyline, and distance without having to manually start or stop a timer.',
};

export const AccessibilityMenu: React.FC = () => {
  const {
    isMenuOpen,
    closeMenu,
    language,
    setLanguage,
    activeProfile,
    profilesExpanded,
    setProfilesExpanded,
    selectProfile,

    // Feature states & toggles
    screenReader,
    toggleScreenReader,
    contrastPlus,
    toggleContrastPlus,
    invertColors,
    cycleInvertColors,
    smartContrast,
    toggleSmartContrast,
    highlightLinks,
    toggleHighlightLinks,
    biggerText,
    cycleBiggerText,
    textSpacing,
    cycleTextSpacing,
    pauseAnimations,
    togglePauseAnimations,
    hideImages,
    toggleHideImages,
    dyslexiaFriendly,
    toggleDyslexiaFriendly,
    pageStructure,
    togglePageStructure,
    lineHeight,
    cycleLineHeight,
    textAlign,
    cycleTextAlign,
    dictionaryOpen,
    toggleDictionary,
    setDictionaryOpen,
    saturation,
    cycleSaturation,

    resetAll,
    speakAnnouncement,
  } = useAccessibility();

  // Modals for sub-dialogs
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [infoModalContent, setInfoModalContent] = useState<{ title: string; message: string } | null>(null);
  const [dictSearchQuery, setDictSearchQuery] = useState('');

  if (!isMenuOpen) {
    return null;
  }

  const showInfo = (title: string, message: string) => {
    setInfoModalContent({ title, message });
    speakAnnouncement(`${title}: ${message}`);
  };

  // Step bar helper (renders dash segments like in screenshot 2)
  const renderStepDashes = (currentStep: number, maxSteps: number = 3) => {
    return (
      <View style={styles.stepBarContainer}>
        {Array.from({ length: maxSteps }).map((_, idx) => {
          const isFilled = idx < currentStep;
          return (
            <View
              key={idx}
              style={[
                styles.stepSegment,
                isFilled ? styles.stepSegmentFilled : styles.stepSegmentEmpty,
              ]}
            />
          );
        })}
      </View>
    );
  };

  // Filter dictionary entries
  const filteredDictEntries = Object.entries(DICTIONARY_ENTRIES).filter(([term, def]) => {
    if (!dictSearchQuery.trim()) return true;
    const q = dictSearchQuery.toLowerCase();
    return term.toLowerCase().includes(q) || def.toLowerCase().includes(q);
  });

  return (
    <Modal
      visible={isMenuOpen}
      animationType="slide"
      transparent={false}
      onRequestClose={closeMenu}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#47554E" />

        {/* 1. TOP HEADER (Dark olive/slate #47554E) */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Accessibility Menu
          </Text>
          <TouchableOpacity
            onPress={closeMenu}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close Accessibility Menu"
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* 2. MAIN SCROLLABLE CONTENT */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* A. LANGUAGE SELECTOR ROW */}
          <TouchableOpacity
            style={styles.languageBar}
            activeOpacity={0.8}
            onPress={() => setLangPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Language selected: ${language.name}. Tap to change language.`}
          >
            <View style={styles.languageBadgeCircle}>
              <Text style={styles.languageBadgeText}>{language.badge}</Text>
            </View>
            <Text style={styles.languageText}>{language.name}</Text>
            <Ionicons name="caret-forward" size={14} color="#374151" style={styles.caretIcon} />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* B. ACCESSIBILITY PROFILES SECTION */}
          <View style={styles.profilesSection}>
            <TouchableOpacity
              style={styles.profilesHeaderRow}
              activeOpacity={0.75}
              onPress={() => setProfilesExpanded(prev => !prev)}
              accessibilityRole="button"
              accessibilityLabel={`Accessibility Profiles ${profilesExpanded ? 'expanded' : 'collapsed'}`}
            >
              <View style={styles.accessibilityIconCircle}>
                <MaterialCommunityIcons name="human" size={18} color="#FFFFFF" />
              </View>
              <Text style={styles.profilesHeadingText}>Accessibility Profiles</Text>
              <Ionicons
                name={profilesExpanded ? 'caret-down' : 'caret-forward'}
                size={16}
                color="#111827"
                style={styles.caretIcon}
              />
              <TouchableOpacity
                onPress={() =>
                  showInfo(
                    'Accessibility Profiles',
                    'Profiles automatically bundle multiple accessibility tools together for specific needs: Blind, Color Blind, Dyslexia, and Seizure/Epileptic.'
                  )
                }
                style={styles.infoCircleSmall}
                accessibilityRole="button"
                accessibilityLabel="Accessibility Profiles Info"
              >
                <Text style={styles.infoCircleText}>i</Text>
              </TouchableOpacity>
            </TouchableOpacity>

            {/* Profiles 2x2 Grid */}
            {profilesExpanded && (
              <View style={styles.profilesGrid}>
                {/* 1. Blind Profile */}
                <TouchableOpacity
                  style={[
                    styles.profileCard,
                    activeProfile === 'blind' && styles.profileCardActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => selectProfile('blind')}
                  accessibilityRole="button"
                  accessibilityLabel="Blind Profile"
                >
                  <MaterialCommunityIcons name="waveform" size={24} color="#111827" />
                  <Text style={styles.profileCardLabel}>Blind</Text>
                  {activeProfile === 'blind' && (
                    <View style={styles.activeCheckmarkCircle}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* 2. Color Blind Profile */}
                <TouchableOpacity
                  style={[
                    styles.profileCard,
                    activeProfile === 'colorBlind' && styles.profileCardActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => selectProfile('colorBlind')}
                  accessibilityRole="button"
                  accessibilityLabel="Color Blind Profile"
                >
                  <Ionicons name="water-sharp" size={22} color="#111827" />
                  <Text style={styles.profileCardLabel}>Color Blind</Text>
                  {activeProfile === 'colorBlind' && (
                    <View style={styles.activeCheckmarkCircle}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* 3. Dyslexia Profile */}
                <TouchableOpacity
                  style={[
                    styles.profileCard,
                    activeProfile === 'dyslexia' && styles.profileCardActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => selectProfile('dyslexia')}
                  accessibilityRole="button"
                  accessibilityLabel="Dyslexia Profile"
                >
                  <Text style={styles.dfLogo}>Df</Text>
                  <Text style={styles.profileCardLabel}>Dyslexia</Text>
                  {activeProfile === 'dyslexia' && (
                    <View style={styles.activeCheckmarkCircle}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {/* 4. Seizure & Epileptic Profile */}
                <TouchableOpacity
                  style={[
                    styles.profileCard,
                    activeProfile === 'seizure' && styles.profileCardActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => selectProfile('seizure')}
                  accessibilityRole="button"
                  accessibilityLabel="Seizure and Epileptic Profile"
                >
                  <MaterialCommunityIcons name="brain" size={24} color="#111827" />
                  <Text style={styles.profileCardLabel} numberOfLines={2}>
                    Seizure & Epileptic
                  </Text>
                  {activeProfile === 'seizure' && (
                    <View style={styles.activeCheckmarkCircle}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* C. INDIVIDUAL ACCESSIBILITY FEATURES (2-Column Grid) */}
          <View style={styles.featuresGrid}>
            {/* 1. Screen Reader */}
            <TouchableOpacity
              style={[styles.featureCard, screenReader && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleScreenReader}
              accessibilityRole="button"
              accessibilityLabel={`Screen Reader: ${screenReader ? 'On' : 'Off'}`}
            >
              <TouchableOpacity
                style={styles.cardInfoBadge}
                onPress={() =>
                  showInfo(
                    'Screen Reader',
                    'Announces buttons, menus, balances, and trips aloud. Seamlessly integrates with VoiceOver, TalkBack, and text-to-speech.'
                  )
                }
              >
                <Text style={styles.cardInfoText}>i</Text>
              </TouchableOpacity>
              <MaterialCommunityIcons name="waveform" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Screen Reader</Text>
              {screenReader && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 2. Contrast + / Invert Colors (Multi-Step Slider) */}
            <TouchableOpacity
              style={[styles.featureCard, invertColors > 0 && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleInvertColors}
              accessibilityRole="button"
              accessibilityLabel={`Invert Colors level ${invertColors}`}
            >
              <MaterialCommunityIcons name="monitor-screenshot" size={30} color="#111827" />
              <Text style={styles.featureCardLabel}>Invert Colors</Text>
              {renderStepDashes(invertColors, 3)}
              {invertColors > 0 && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 3. Smart Contrast */}
            <TouchableOpacity
              style={[styles.featureCard, smartContrast && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleSmartContrast}
              accessibilityRole="button"
              accessibilityLabel={`Smart Contrast: ${smartContrast ? 'On' : 'Off'}`}
            >
              <MaterialCommunityIcons name="circle-slice-4" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Smart Contrast</Text>
              {smartContrast && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 4. Highlight Links */}
            <TouchableOpacity
              style={[styles.featureCard, highlightLinks && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleHighlightLinks}
              accessibilityRole="button"
              accessibilityLabel={`Highlight Links: ${highlightLinks ? 'On' : 'Off'}`}
            >
              <MaterialCommunityIcons name="link-variant" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Highlight Links</Text>
              {highlightLinks && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 5. Bigger Text (Multi-Step) */}
            <TouchableOpacity
              style={[styles.featureCard, biggerText > 0 && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleBiggerText}
              accessibilityRole="button"
              accessibilityLabel={`Bigger Text level ${biggerText}`}
            >
              <Text style={styles.ttIcon}>T T</Text>
              <Text style={styles.featureCardLabel}>Bigger Text</Text>
              {renderStepDashes(biggerText, 3)}
              {biggerText > 0 && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 6. Text Spacing (Multi-Step) */}
            <TouchableOpacity
              style={[styles.featureCard, textSpacing > 0 && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleTextSpacing}
              accessibilityRole="button"
              accessibilityLabel={`Text Spacing level ${textSpacing}`}
            >
              <Text style={styles.spacingIcon}>{'< - - - >'}</Text>
              <Text style={styles.featureCardLabel}>Text Spacing</Text>
              {renderStepDashes(textSpacing, 2)}
              {textSpacing > 0 && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 7. Pause Animations */}
            <TouchableOpacity
              style={[styles.featureCard, pauseAnimations && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={togglePauseAnimations}
              accessibilityRole="button"
              accessibilityLabel={`Pause Animations: ${pauseAnimations ? 'On' : 'Off'}`}
            >
              <View style={styles.pauseSunburst}>
                <Ionicons name="pause" size={16} color="#111827" />
              </View>
              <Text style={styles.featureCardLabel}>Pause Animations</Text>
              {pauseAnimations && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 8. Hide Images */}
            <TouchableOpacity
              style={[styles.featureCard, hideImages && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleHideImages}
              accessibilityRole="button"
              accessibilityLabel={`Hide Images: ${hideImages ? 'On' : 'Off'}`}
            >
              <MaterialCommunityIcons name="image-off-outline" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Hide Images</Text>
              {hideImages && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 9. Dyslexia Friendly */}
            <TouchableOpacity
              style={[styles.featureCard, dyslexiaFriendly && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleDyslexiaFriendly}
              accessibilityRole="button"
              accessibilityLabel={`Dyslexia Friendly font: ${dyslexiaFriendly ? 'On' : 'Off'}`}
            >
              <TouchableOpacity
                style={styles.cardInfoBadge}
                onPress={() =>
                  showInfo(
                    'Dyslexia Friendly',
                    'Enhances legibility using specialized weighted lettering, generous character kerning, and increased contrast.'
                  )
                }
              >
                <Text style={styles.cardInfoText}>i</Text>
              </TouchableOpacity>
              <Text style={styles.dfLogoLarge}>Df</Text>
              <Text style={styles.featureCardLabel}>Dyslexia Friendly</Text>
              {dyslexiaFriendly && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 10. Page Structure */}
            <TouchableOpacity
              style={[styles.featureCard, pageStructure && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={togglePageStructure}
              accessibilityRole="button"
              accessibilityLabel={`Page Structure: ${pageStructure ? 'On' : 'Off'}`}
            >
              <MaterialCommunityIcons name="layers-outline" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Page Structure</Text>
              {pageStructure && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 11. Line Height (Multi-Step) */}
            <TouchableOpacity
              style={[styles.featureCard, lineHeight > 0 && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleLineHeight}
              accessibilityRole="button"
              accessibilityLabel={`Line Height level ${lineHeight}`}
            >
              <MaterialCommunityIcons name="format-line-spacing" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Line Height</Text>
              {renderStepDashes(lineHeight, 3)}
              {lineHeight > 0 && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 12. Text Align */}
            <TouchableOpacity
              style={[styles.featureCard, textAlign !== 'left' && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleTextAlign}
              accessibilityRole="button"
              accessibilityLabel={`Text Align: ${textAlign}`}
            >
              <Feather
                name={
                  textAlign === 'center'
                    ? 'align-center'
                    : textAlign === 'justify'
                    ? 'align-justify'
                    : 'align-left'
                }
                size={30}
                color="#111827"
              />
              <Text style={styles.featureCardLabel}>Text Align</Text>
              <Text style={styles.subtextPill}>{textAlign.toUpperCase()}</Text>
              {textAlign !== 'left' && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 13. Dictionary */}
            <TouchableOpacity
              style={[styles.featureCard, dictionaryOpen && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={toggleDictionary}
              accessibilityRole="button"
              accessibilityLabel="Open Accessible Mileage & Tax Dictionary"
            >
              <TouchableOpacity
                style={styles.cardInfoBadge}
                onPress={() =>
                  showInfo(
                    'Mileage & Tax Dictionary',
                    'Quickly search and look up definitions for IRS tax terms, mileage deduction rules, standard rates, and accounting terminology.'
                  )
                }
              >
                <Text style={styles.cardInfoText}>i</Text>
              </TouchableOpacity>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={32} color="#111827" />
              <Text style={styles.featureCardLabel}>Dictionary</Text>
              {dictionaryOpen && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            {/* 14. Saturation (Multi-Step) */}
            <TouchableOpacity
              style={[styles.featureCard, saturation > 0 && styles.featureCardActive]}
              activeOpacity={0.8}
              onPress={cycleSaturation}
              accessibilityRole="button"
              accessibilityLabel={`Color Saturation level ${saturation}`}
            >
              <Ionicons name="contrast-outline" size={30} color="#111827" />
              <Text style={styles.featureCardLabel}>Saturation</Text>
              {renderStepDashes(saturation, 3)}
              {saturation > 0 && (
                <View style={styles.cardCheckmark}>
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* 3. BOTTOM STICKY RESET BUTTON (Matching Screenshot 3) */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.resetButton}
            activeOpacity={0.85}
            onPress={resetAll}
            accessibilityRole="button"
            accessibilityLabel="Reset All Accessibility Settings"
          >
            <Ionicons name="refresh" size={22} color="#FFFFFF" style={styles.resetIcon} />
            <Text style={styles.resetButtonText}>Reset All Accessibility Settings</Text>
          </TouchableOpacity>
        </View>

        {/* --- SUB-MODAL 1: Language Picker --- */}
        <Modal
          visible={langPickerVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setLangPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalHeading}>Select Language</Text>
              <Text style={styles.modalSubtitle}>
                Choose your preferred language for screen reader voice and text labels:
              </Text>
              {SUPPORTED_LANGUAGES.map(item => (
                <TouchableOpacity
                  key={item.code}
                  style={[
                    styles.langOptionRow,
                    language.code === item.code && styles.langOptionRowActive,
                  ]}
                  onPress={() => {
                    setLanguage(item);
                    setLangPickerVisible(false);
                  }}
                >
                  <View style={styles.languageBadgeCircle}>
                    <Text style={styles.languageBadgeText}>{item.badge}</Text>
                  </View>
                  <Text style={styles.langOptionText}>{item.name}</Text>
                  {language.code === item.code && (
                    <Ionicons name="checkmark" size={18} color="#10B981" />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setLangPickerVisible(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* --- SUB-MODAL 2: Info Explainer Popup --- */}
        <Modal
          visible={infoModalContent !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setInfoModalContent(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.infoModalHeader}>
                <View style={styles.infoCircleLarge}>
                  <Text style={styles.infoCircleLargeText}>i</Text>
                </View>
                <Text style={styles.modalHeading}>{infoModalContent?.title}</Text>
              </View>
              <Text style={styles.infoModalBody}>{infoModalContent?.message}</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setInfoModalContent(null)}
              >
                <Text style={styles.modalCloseBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* --- SUB-MODAL 3: Accessible Tax & Mileage Dictionary --- */}
        <Modal
          visible={dictionaryOpen}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setDictionaryOpen(false)}
        >
          <SafeAreaView style={styles.dictSafeArea}>
            <View style={styles.dictHeader}>
              <View style={styles.dictHeaderLeft}>
                <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#FFFFFF" />
                <Text style={styles.dictHeaderTitle}>Mileage & Tax Dictionary</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDictionaryOpen(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.dictSearchBox}>
              <Ionicons name="search" size={20} color="#6B7280" />
              <TextInput
                style={styles.dictSearchInput}
                placeholder="Search terms (e.g. Standard Rate, CPA, Medical)..."
                placeholderTextColor="#9CA3AF"
                value={dictSearchQuery}
                onChangeText={setDictSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.dictList} contentContainerStyle={styles.dictListContent}>
              {filteredDictEntries.length === 0 ? (
                <View style={styles.emptyDictContainer}>
                  <Text style={styles.emptyDictText}>No definitions match "{dictSearchQuery}"</Text>
                </View>
              ) : (
                filteredDictEntries.map(([term, definition]) => (
                  <View key={term} style={styles.dictEntryCard}>
                    <Text style={styles.dictTermText}>{term}</Text>
                    <Text style={styles.dictDefText}>{definition}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#47554E', // Matching top bar background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#47554E', // Slate/olive header
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#ECEFF3', // Light card backing from screenshots
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },

  // Language row
  languageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECEFF3',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  languageBadgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1D4ED8', // Vibrant blue
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  languageBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  languageText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  caretIcon: {
    marginLeft: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#D1D5DB',
    marginVertical: 12,
  },

  // Profiles section
  profilesSection: {
    marginBottom: 16,
  },
  profilesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  accessibilityIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profilesHeadingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  infoCircleSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CCECEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  infoCircleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  profilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  profileCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
  },
  profileCardActive: {
    borderColor: '#111827',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  profileCardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 10,
    flex: 1,
  },
  dfLogo: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: '#111827',
  },
  activeCheckmarkCircle: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2-Column features grid
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 126,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  featureCardActive: {
    borderColor: '#111827',
    borderWidth: 2.5,
  },
  featureCardLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 10,
    textAlign: 'center',
  },
  cardCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#4B5563', // Charcoal circle badge
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CCECEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },

  // Step dashes (like Invert Colors in screenshot 2)
  stepBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    width: '70%',
    gap: 4,
  },
  stepSegment: {
    flex: 1,
    height: 3.5,
    borderRadius: 2,
  },
  stepSegmentFilled: {
    backgroundColor: '#374151',
  },
  stepSegmentEmpty: {
    backgroundColor: '#D1D5DB',
  },

  // Specific custom icons
  ttIcon: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: '#111827',
  },
  spacingIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pauseSunburst: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dfLogoLarge: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: '#111827',
  },
  subtextPill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },

  // Bottom reset bar
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: '#ECEFF3',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  resetButton: {
    backgroundColor: '#47554E', // Slate/olive matching header
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  resetIcon: {
    marginRight: 8,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Generic Sub-modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 16,
    lineHeight: 20,
  },
  langOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  langOptionRowActive: {
    backgroundColor: '#F3F4F6',
  },
  langOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  modalCloseBtn: {
    marginTop: 18,
    backgroundColor: '#47554E',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Info modal
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoCircleLarge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#CCECEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoCircleLargeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  infoModalBody: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 8,
  },

  // Dictionary modal
  dictSafeArea: {
    flex: 1,
    backgroundColor: '#1E293B',
  },
  dictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  dictHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dictHeaderTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dictSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dictSearchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  dictList: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  dictListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  dictEntryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dictTermText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#38BDF8',
    marginBottom: 6,
  },
  dictDefText: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  emptyDictContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyDictText: {
    fontSize: 15,
    color: '#94A3B8',
  },
});
