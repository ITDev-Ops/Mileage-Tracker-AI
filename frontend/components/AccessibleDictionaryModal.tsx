import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAccessibility } from '../context/AccessibilityContext';

export const DICTIONARY_ENTRIES: Record<string, string> = {
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
  'Depreciation':
    'The IRS tax deduction that allows businesses to write off the wear-and-tear cost of a vehicle over its useful lifespan (typically 5 years for cars).',
  'IRS Section 179':
    'An IRS deduction allowing business owners to deduct the entire purchase price of qualifying equipment and vehicles in the year acquired.',
  'Form 1040 Schedule C':
    'The IRS tax form used by sole proprietors and self-employed individuals to report business income and deductible vehicle expenses.',
  'Actual Expenses Method':
    'An alternative to the Standard Mileage Rate where you track and deduct actual car expenses including gas, repairs, insurance, depreciation, and lease payments.',
  'Commuting Rule':
    'The IRS rule stating that driving between your personal residence and your main workplace is personal commuting and cannot be deducted.',
  'Reimbursement Rate':
    'The rate per mile employers pay employees to cover business use of a personal vehicle, typically aligned with IRS standard rates.',
};

export const AccessibleDictionaryModal: React.FC = () => {
  const { dictionaryOpen, setDictionaryOpen, speakAnnouncement } = useAccessibility();
  const [searchQuery, setSearchQuery] = useState('');

  if (!dictionaryOpen) {
    return null;
  }

  const filteredEntries = Object.entries(DICTIONARY_ENTRIES).filter(([term, def]) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return term.toLowerCase().includes(q) || def.toLowerCase().includes(q);
  });

  const handleSpeakTerm = (term: string, definition: string) => {
    speakAnnouncement(`${term}: ${definition}`);
  };

  return (
    <Modal
      visible={dictionaryOpen}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setDictionaryOpen(false)}
    >
      <SafeAreaView style={styles.dictSafeArea}>
        <View style={styles.dictHeader}>
          <View style={styles.dictHeaderLeft}>
            <MaterialCommunityIcons name="book-open-page-variant" size={24} color="#10B981" />
            <Text style={styles.dictHeaderTitle}>Mileage & Tax Dictionary</Text>
          </View>
          <TouchableOpacity
            onPress={() => setDictionaryOpen(false)}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close Dictionary"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <Text style={styles.dictSubtitle}>
          Tap any definition card to listen to spoken explanation
        </Text>

        <View style={styles.dictSearchBox}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.dictSearchInput}
            placeholder="Search terms (e.g. Standard Rate, CPA, Medical)..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
        </View>

        <ScrollView style={styles.dictList} contentContainerStyle={styles.dictListContent}>
          {filteredEntries.length === 0 ? (
            <View style={styles.emptyDictContainer}>
              <Text style={styles.emptyDictText}>No definitions match "{searchQuery}"</Text>
            </View>
          ) : (
            filteredEntries.map(([term, definition]) => (
              <TouchableOpacity
                key={term}
                style={styles.dictEntryCard}
                activeOpacity={0.7}
                onPress={() => handleSpeakTerm(term, definition)}
                accessibilityRole="button"
                accessibilityLabel={`${term}: ${definition}. Tap to hear audio.`}
              >
                <View style={styles.dictTermRow}>
                  <Text style={styles.dictTermText}>{term}</Text>
                  <View style={styles.audioPill}>
                    <Ionicons name="volume-medium-outline" size={16} color="#10B981" />
                    <Text style={styles.audioPillText}>Listen</Text>
                  </View>
                </View>
                <Text style={styles.dictDefText}>{definition}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  dictSafeArea: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  dictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
    backgroundColor: '#18181B',
  },
  dictHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dictHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  dictSubtitle: {
    color: '#A1A1AA',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#27272A',
  },
  dictSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#18181B',
    borderWidth: 1.5,
    borderColor: '#3F3F46',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  dictSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  dictList: {
    flex: 1,
  },
  dictListContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  dictEntryCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#27272A',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dictTermRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dictTermText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  audioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  audioPillText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  dictDefText: {
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 21,
  },
  emptyDictContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyDictText: {
    color: '#71717A',
    fontSize: 15,
    textAlign: 'center',
  },
});
