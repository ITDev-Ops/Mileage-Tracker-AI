export const Colors = {
  bg: {
    primary: '#09090B',
    secondary: '#18181B',
    tertiary: '#27272A',
    overlay: 'rgba(0,0,0,0.85)',
    card: '#18181B',
  },
  text: {
    primary: '#FAFAFA',
    secondary: '#A1A1AA',
    tertiary: '#71717A',
    inverse: '#09090B',
  },
  brand: {
    primary: '#10B981',
    primaryDim: 'rgba(16,185,129,0.15)',
    secondary: '#3B82F6',
    secondaryDim: 'rgba(59,130,246,0.15)',
    accent: '#F43F5E',
    accentDim: 'rgba(244,63,94,0.15)',
    warning: '#F59E0B',
    warningDim: 'rgba(245,158,11,0.15)',
    purple: '#A78BFA',
  },
  status: {
    success: '#10B981',
    error: '#EF4444',
    info: '#3B82F6',
    business: '#10B981',
    personal: '#3B82F6',
    medical: '#F59E0B',
    charity: '#A78BFA',
    unclassified: '#71717A',
  },
  border: '#27272A',
  borderLight: '#3F3F46',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  screen: 16,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  huge: 38,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  full: 9999,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const ClassificationColor: Record<string, string> = {
  business: Colors.status.business,
  personal: Colors.status.personal,
  medical: Colors.status.medical,
  charity: Colors.status.charity,
  unclassified: Colors.status.unclassified,
};
