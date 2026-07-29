import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  Linking, ActivityIndicator, Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const TOS_URL = 'https://globalsysnetcyber.com/apps/terms-of-service';
const PRIVACY_POLICY_URL = 'https://globalsysnetcyber.com/apps/privacy-policy';
const PRODUCT_VIDEO_URL = 'https://globalsysnetcyber.com/apps/';

export default function LegalConsentModal() {
  const { user, acceptLegalTerms } = useAuth();
  const [tosAgreed, setTosAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [videoAgreed, setVideoAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isVisible = Boolean(
    user && (
      user.legal_consent_required === true ||
      (user.legal_consent_required === undefined && !user.legal_agreements) ||
      (Array.isArray(user.missing_consents) && user.missing_consents.length > 0)
    )
  );
  const isAllAgreed = tosAgreed && privacyAgreed && videoAgreed;

  const handleAccept = async () => {
    if (!isAllAgreed) return;
    setLoading(true);
    try {
      await acceptLegalTerms({
        tos_agreed: true,
        privacy_policy_agreed: true,
        product_video_agreed: true,
      });
      setTosAgreed(false);
      setPrivacyAgreed(false);
      setVideoAgreed(false);
    } catch (err: any) {
      Alert.alert('Agreement Error', err.message || 'Failed to record legal consent. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      hardwareAccelerated={true}
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header Icon */}
          <View style={styles.iconWrap}>
            <Feather name="shield" size={28} color="#10B981" />
          </View>

          <Text style={styles.title}>Legal Terms & Policy Update</Text>
          <Text style={styles.description}>
            To continue using Mileage Tracker AI, please review and actively check the required legal agreements and policies below.
          </Text>

          {/* Checkboxes */}
          <View style={styles.checkboxGroup}>
            {/* Checkbox 1: Terms of Service */}
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[styles.checkbox, tosAgreed && styles.checkboxSelected]}
                onPress={() => setTosAgreed(!tosAgreed)}
                activeOpacity={0.7}
              >
                {tosAgreed && <Feather name="check" size={14} color="#09090B" />}
              </TouchableOpacity>
              <View style={styles.checkboxTextWrap}>
                <Text style={styles.checkboxText}>I agree to the </Text>
                <TouchableOpacity onPress={() => Linking.openURL(TOS_URL)}>
                  <Text style={styles.linkText}>Terms of Service</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Checkbox 2: Privacy Policy */}
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[styles.checkbox, privacyAgreed && styles.checkboxSelected]}
                onPress={() => setPrivacyAgreed(!privacyAgreed)}
                activeOpacity={0.7}
              >
                {privacyAgreed && <Feather name="check" size={14} color="#09090B" />}
              </TouchableOpacity>
              <View style={styles.checkboxTextWrap}>
                <Text style={styles.checkboxText}>I agree to the </Text>
                <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                  <Text style={styles.linkText}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Checkbox 3: Watched Product Video */}
            <View style={styles.checkboxRow}>
              <TouchableOpacity
                style={[styles.checkbox, videoAgreed && styles.checkboxSelected]}
                onPress={() => setVideoAgreed(!videoAgreed)}
                activeOpacity={0.7}
              >
                {videoAgreed && <Feather name="check" size={14} color="#09090B" />}
              </TouchableOpacity>
              <View style={styles.checkboxTextWrap}>
                <Text style={styles.checkboxText}>I confirm I watched the </Text>
                <TouchableOpacity onPress={() => Linking.openURL(PRODUCT_VIDEO_URL)}>
                  <Text style={styles.linkText}>Product Video</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.acceptBtn, (!isAllAgreed || loading) && styles.disabledBtn]}
            disabled={!isAllAgreed || loading}
            onPress={handleAccept}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#09090B" />
            ) : (
              <Text style={[styles.acceptBtnText, !isAllAgreed && styles.disabledBtnText]}>
                Accept & Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 9, 11, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 999999,
    elevation: 9999,
  },
  container: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#0D211C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  checkboxGroup: {
    width: '100%',
    backgroundColor: '#27272A',
    borderRadius: 12,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#71717A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#18181B',
  },
  checkboxSelected: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkboxTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  checkboxText: {
    color: '#D4D4D8',
    fontSize: 13,
  },
  linkText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  acceptBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    height: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    backgroundColor: '#3F3F46',
    opacity: 0.6,
  },
  acceptBtnText: {
    color: '#09090B',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledBtnText: {
    color: '#A1A1AA',
  },
});
