export const countryPhoneOptions = [
  { code: '+91', country: 'India', min: 10, max: 10 },
  { code: '+1', country: 'United States / Canada', min: 10, max: 10 },
  { code: '+44', country: 'United Kingdom', min: 10, max: 10 },
  { code: '+61', country: 'Australia', min: 9, max: 9 },
  { code: '+971', country: 'United Arab Emirates', min: 9, max: 9 },
  { code: '+966', country: 'Saudi Arabia', min: 9, max: 9 },
  { code: '+974', country: 'Qatar', min: 8, max: 8 },
  { code: '+965', country: 'Kuwait', min: 8, max: 8 },
  { code: '+968', country: 'Oman', min: 8, max: 8 },
  { code: '+973', country: 'Bahrain', min: 8, max: 8 },
  { code: '+65', country: 'Singapore', min: 8, max: 8 },
  { code: '+60', country: 'Malaysia', min: 9, max: 10 },
  { code: '+94', country: 'Sri Lanka', min: 9, max: 9 },
  { code: '+880', country: 'Bangladesh', min: 10, max: 10 },
  { code: '+977', country: 'Nepal', min: 10, max: 10 },
  { code: '+92', country: 'Pakistan', min: 10, max: 10 },
  { code: '+86', country: 'China', min: 11, max: 11 },
  { code: '+81', country: 'Japan', min: 10, max: 10 },
  { code: '+82', country: 'South Korea', min: 9, max: 10 },
  { code: '+49', country: 'Germany', min: 10, max: 11 },
  { code: '+33', country: 'France', min: 9, max: 9 },
  { code: '+39', country: 'Italy', min: 9, max: 10 },
  { code: '+34', country: 'Spain', min: 9, max: 9 },
  { code: '+31', country: 'Netherlands', min: 9, max: 9 },
  { code: '+41', country: 'Switzerland', min: 9, max: 9 },
  { code: '+46', country: 'Sweden', min: 9, max: 9 },
  { code: '+47', country: 'Norway', min: 8, max: 8 },
  { code: '+45', country: 'Denmark', min: 8, max: 8 },
  { code: '+358', country: 'Finland', min: 9, max: 10 },
  { code: '+353', country: 'Ireland', min: 9, max: 9 },
  { code: '+7', country: 'Russia / Kazakhstan', min: 10, max: 10 },
  { code: '+90', country: 'Turkey', min: 10, max: 10 },
  { code: '+27', country: 'South Africa', min: 9, max: 9 },
  { code: '+20', country: 'Egypt', min: 10, max: 10 },
  { code: '+234', country: 'Nigeria', min: 10, max: 10 },
  { code: '+254', country: 'Kenya', min: 9, max: 9 },
  { code: '+55', country: 'Brazil', min: 10, max: 11 },
  { code: '+52', country: 'Mexico', min: 10, max: 10 },
  { code: '+54', country: 'Argentina', min: 10, max: 10 },
  { code: '+57', country: 'Colombia', min: 10, max: 10 },
  { code: '+56', country: 'Chile', min: 9, max: 9 },
  { code: '+64', country: 'New Zealand', min: 8, max: 9 },
];

export const getCountryPhoneOption = (code) =>
  countryPhoneOptions.find((option) => option.code === code) || countryPhoneOptions[0];

export const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

export const formatPhone = ({ countryCode, phone }) => {
  const option = getCountryPhoneOption(countryCode);
  return `${option.code}${digitsOnly(phone).slice(0, option.max)}`;
};

export const parseStoredPhone = (value) => {
  const raw = String(value || '').trim();
  const matched = [...countryPhoneOptions]
    .sort((a, b) => b.code.length - a.code.length)
    .find((option) => raw.startsWith(option.code));

  if (matched) {
    return {
      countryCode: matched.code,
      phone: digitsOnly(raw.slice(matched.code.length)).slice(0, matched.max),
    };
  }

  return {
    countryCode: '+91',
    phone: digitsOnly(raw).slice(0, 10),
  };
};

const isSequential = (digits, direction) => {
  if (digits.length < 6) return false;
  for (let i = 1; i < digits.length; i += 1) {
    const prev = Number(digits[i - 1]);
    const current = Number(digits[i]);
    const expected = direction === 'up' ? (prev + 1) % 10 : (prev + 9) % 10;
    if (current !== expected) return false;
  }
  return true;
};

export const validatePhoneNumber = ({ countryCode, phone }) => {
  const option = getCountryPhoneOption(countryCode);
  const digits = digitsOnly(phone);

  if (!digits) return 'Phone number is required';
  if (digits.length < option.min || digits.length > option.max) {
    return `${option.country} phone numbers must be ${option.min === option.max ? option.max : `${option.min}-${option.max}`} digits.`;
  }
  if (/^(\d)\1+$/.test(digits)) return 'Enter a real phone number, not repeated digits.';
  if (isSequential(digits, 'up') || isSequential(digits, 'down')) {
    return 'Enter a real phone number, not sequential digits.';
  }
  if (/^(1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321)/.test(digits)) {
    return 'Enter a real phone number, not a simple number pattern.';
  }
  if (option.code === '+91' && !/^[6-9]/.test(digits)) {
    return 'Indian mobile numbers must start with 6, 7, 8, or 9.';
  }

  return '';
};
