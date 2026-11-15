import React, { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useAccessibility } from '../context/AccessibilityContext';

export const AccessibilityFAB: React.FC = () => {
  const { toggleMenu, hasActiveSettings, pauseAnimations, isMenuOpen } = useAccessibility();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  
  let isTabBarVisible = true;
  try {
    const segments = useSegments();
    isTabBarVisible = (segments as any)?.[0] === '(tabs)';
  } catch {
    isTabBarVisible = true;
  }

  const defaultBottom = isTabBarVisible
    ? (Platform.OS === 'ios' ? 84 : 74)
    : (Platform.OS === 'ios' ? 28 : 20);

  // Position animated coordinates (defaults to bottom right)
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // Pulse animation for outer glowing blue ring (disabled if pauseAnimations is true)
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (pauseAnimations) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [pauseAnimations, pulseAnim]);

  // Drag responder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only drag if moved more than 6px
        return Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  if (isMenuOpen) {
    // Hide FAB while the full menu modal is open
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: defaultBottom,
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={toggleMenu}
        accessibilityRole="button"
        accessibilityLabel="Open Accessibility Menu"
        accessibilityHint="Opens profiles, bigger text, contrast, and screen reader controls"
        style={styles.touchable}
      >
        {/* Glowing pulsing blue outer aura ring */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />

        {/* Primary circular button body matching screenshot */}
        <View style={styles.fabCircle}>
          {/* Universal Accessibility Icon: Human figure inside circle */}
          <View style={styles.innerCircleBorder}>
            <MaterialCommunityIcons name="human" size={20} color="#FFFFFF" style={styles.humanIcon} />
          </View>

          {/* Active checkmark badge in top-right corner */}
          {hasActiveSettings && (
            <View style={styles.activeBadge}>
              <Ionicons name="checkmark-sharp" size={9} color="#FFFFFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const BUTTON_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 14,
    zIndex: 99999,
    elevation: 20,
    width: BUTTON_SIZE + 8,
    height: BUTTON_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchable: {
    width: BUTTON_SIZE + 8,
    height: BUTTON_SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: BUTTON_SIZE + 6,
    height: BUTTON_SIZE + 6,
    borderRadius: (BUTTON_SIZE + 6) / 2,
    borderWidth: 2,
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  fabCircle: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#374151', // Dark charcoal/slate
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 10,
  },
  innerCircleBorder: {
    width: BUTTON_SIZE - 10,
    height: BUTTON_SIZE - 10,
    borderRadius: (BUTTON_SIZE - 10) / 2,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  humanIcon: {
    marginTop: -1,
  },
  activeBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#16A34A', // Vibrant green
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 5,
  },
});

