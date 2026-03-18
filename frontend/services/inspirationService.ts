import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  SELECTED_CATEGORY: 'inspiration_category',
  CUSTOM_MESSAGE: 'inspiration_custom_message',
  APP_OPENED_TIME: 'app_opened_time',
  AI_MESSAGE_CACHE: 'ai_inspiration_cache',
  AI_MESSAGE_DAY: 'ai_inspiration_day',
};

// Inspirational categories with messages and colors
export interface InspirationCategory {
  id: string;
  name: string;
  color: string;
  messages: string[];
}

export const INSPIRATION_CATEGORIES: InspirationCategory[] = [
  {
    id: 'potential',
    name: 'Unleash Your Potential',
    color: '#FFD700', // Gold
    messages: [
      'Your potential is limitless. Every mile brings you closer to your dreams.',
      'The road to success is always under construction. Keep driving forward!',
      'Believe in yourself. Your journey has purpose.',
      'Great things never come from comfort zones. Embrace the drive.',
      'Today is a new opportunity to become a better version of yourself.',
      'Success is not final, failure is not fatal: it is the courage to continue that counts.',
      'Your only limit is your mind. Push beyond!',
    ],
  },
  {
    id: 'mindful',
    name: 'Mindful Living',
    color: '#87CEEB', // Sky Blue
    messages: [
      'Be present in every moment of your journey.',
      'Peace comes from within. Drive with intention.',
      'Breathe deeply. The destination will come.',
      'Mindfulness is a journey, not a destination.',
      'Find calm in motion. Your drive is your meditation.',
      'Let go of what you cannot control. Focus on the road ahead.',
      'Each breath is a new beginning.',
    ],
  },
  {
    id: 'connection',
    name: 'Cultivate Connection',
    color: '#FF69B4', // Hot Pink
    messages: [
      'Every journey connects you to people and places that matter.',
      'Relationships are the highways of life.',
      'Share your journey. You\'re never alone on this road.',
      'Connection is the bridge between miles and memories.',
      'The people you meet along the way make the journey worthwhile.',
      'Drive with an open heart. Amazing connections await.',
      'Together we go further. Community is strength.',
    ],
  },
  {
    id: 'spiritual',
    name: 'Spiritual',
    color: '#DDA0DD', // Plum/Purple
    messages: [
      'Faith is taking the first step when you can\'t see the whole staircase.',
      'Your path is guided by a higher purpose.',
      'Trust the journey. The universe has a plan.',
      'Gratitude turns what we have into enough.',
      'Let your spirit guide your drive.',
      'Every mile is a blessing. Give thanks for the road.',
      'Inner peace fuels the longest journeys.',
    ],
  },
  {
    id: 'curiosity',
    name: 'Life Long Curiosity',
    color: '#32CD32', // Lime Green
    messages: [
      'Stay curious. Every road has something new to teach.',
      'The more you learn, the more places you\'ll go.',
      'Curiosity is the engine of achievement.',
      'Ask questions. The journey is the answer.',
      'Wonder is the beginning of wisdom.',
      'Every mile is a chance to discover something new.',
      'Keep exploring. The best destinations are undiscovered.',
    ],
  },
];

// Get current category
export async function getSelectedCategory(): Promise<string> {
  try {
    const category = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_CATEGORY);
    return category || 'potential'; // Default to first category
  } catch (e) {
    return 'potential';
  }
}

// Set current category
export async function setSelectedCategory(categoryId: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_CATEGORY, categoryId);
}

// Get custom message (if user input)
export async function getCustomMessage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_MESSAGE);
  } catch (e) {
    return null;
  }
}

// Set custom message
export async function setCustomMessage(message: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_MESSAGE, message);
}

// Get cached AI message for today
export async function getCachedAIMessage(): Promise<{ message: string; color: string } | null> {
  try {
    const cachedDay = await AsyncStorage.getItem(STORAGE_KEYS.AI_MESSAGE_DAY);
    const today = new Date().toDateString();
    
    if (cachedDay === today) {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.AI_MESSAGE_CACHE);
      if (cached) {
        return JSON.parse(cached);
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Cache AI message for today
export async function cacheAIMessage(message: string, color: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.AI_MESSAGE_DAY, new Date().toDateString());
    await AsyncStorage.setItem(STORAGE_KEYS.AI_MESSAGE_CACHE, JSON.stringify({ message, color }));
  } catch (e) {
    console.log('Error caching AI message:', e);
  }
}

// Get daily message based on category and day (fallback for offline)
export async function getDailyMessage(): Promise<{ message: string; color: string }> {
  const categoryId = await getSelectedCategory();
  
  // Check for custom message first
  if (categoryId === 'custom') {
    const customMsg = await getCustomMessage();
    if (customMsg) {
      return { message: customMsg, color: '#00CED1' }; // Turquoise for custom
    }
  }
  
  const category = INSPIRATION_CATEGORIES.find(c => c.id === categoryId) || INSPIRATION_CATEGORIES[0];
  
  // Use day of year to cycle through messages
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const messageIndex = dayOfYear % category.messages.length;
  
  return {
    message: category.messages[messageIndex],
    color: category.color,
  };
}

// Get all messages for scrolling (from current category)
export async function getAllCategoryMessages(): Promise<{ messages: string[]; color: string }> {
  const categoryId = await getSelectedCategory();
  
  if (categoryId === 'custom') {
    const customMsg = await getCustomMessage();
    return {
      messages: customMsg ? [customMsg] : ['Set your own inspirational message in Settings'],
      color: '#00CED1',
    };
  }
  
  const category = INSPIRATION_CATEGORIES.find(c => c.id === categoryId) || INSPIRATION_CATEGORIES[0];
  return {
    messages: category.messages,
    color: category.color,
  };
}

// Check if app was opened within last 5 minutes (for magnified view)
export async function shouldShowMagnified(): Promise<boolean> {
  try {
    const openedTime = await AsyncStorage.getItem(STORAGE_KEYS.APP_OPENED_TIME);
    if (!openedTime) {
      // First time - set the time and return true
      await AsyncStorage.setItem(STORAGE_KEYS.APP_OPENED_TIME, Date.now().toString());
      return true;
    }
    
    const elapsedMs = Date.now() - parseInt(openedTime);
    const fiveMinutes = 5 * 60 * 1000;
    
    // If more than 5 minutes have passed, reset the timer
    if (elapsedMs > fiveMinutes) {
      await AsyncStorage.setItem(STORAGE_KEYS.APP_OPENED_TIME, Date.now().toString());
      return true;
    }
    
    return elapsedMs < fiveMinutes;
  } catch (e) {
    return false;
  }
}

// Reset app opened time (call when app comes to foreground)
export async function resetAppOpenedTime(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.APP_OPENED_TIME, Date.now().toString());
}
