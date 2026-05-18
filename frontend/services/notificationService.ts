import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

export async function scheduleUnclassifiedReminder(unclassifiedCount: number): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync('unclassified-reminder').catch(() => {});
    if (unclassifiedCount === 0) return;
    await Notifications.scheduleNotificationAsync({
      identifier: 'unclassified-reminder',
      content: {
        title: '🚗 Mileage Tracker AI',
        body: `${unclassifiedCount} trip${unclassifiedCount !== 1 ? 's' : ''} need classification — maximize your tax deductions!`,
        data: { screen: 'trips' },
        sound: undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 20,
        minute: 0,
      },
    });
  } catch (e) { console.warn('Schedule notification error:', e); }
}

export async function sendTripDetectedNotification(address: string): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🚗 Drive Detected!',
        body: `Auto-tracking started from ${address}. Tap to view.`,
        data: { screen: 'dashboard' },
      },
      trigger: null,
    });
  } catch {}
}

export async function sendTripEndedNotification(miles: number): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Trip Logged',
        body: `${miles.toFixed(1)} miles recorded. Classify your trip to track deductions.`,
        data: { screen: 'trips' },
      },
      trigger: null,
    });
  } catch {}
}

export async function cancelAllReminders(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}
