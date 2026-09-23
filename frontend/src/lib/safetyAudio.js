// Short demo prompts, with generated audio bundled in public/audio/safety.
export const SAFETY_LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', greeting: 'नमस्ते! कैटलॉग में आपका स्वागत है।', seatbelt: 'कृपया सीट बेल्ट लगाएँ।' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', greeting: 'வணக்கம்! கேட்டலாக்கிற்கு வரவேற்கிறோம்.', seatbelt: 'தயவுசெய்து சீட் பெல்ட்டை அணியுங்கள்.' },
  { code: 'en-IN', name: 'English', nativeName: 'English', greeting: 'Hello! Welcome to CATalog.', seatbelt: 'Please fasten your seatbelt.' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', greeting: 'నమస్కారం! క్యాటలాగ్‌కు స్వాగతం.', seatbelt: 'దయచేసి సీటు బెల్ట్ పెట్టుకోండి.' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', greeting: 'ನಮಸ್ಕಾರ! ಕ್ಯಾಟಲಾಗ್‌ಗೆ ಸ್ವಾಗತ.', seatbelt: 'ದಯವಿಟ್ಟು ಸೀಟ್ ಬೆಲ್ಟ್ ಧರಿಸಿ.' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', greeting: 'നമസ്കാരം! കാറ്റലോഗിലേക്ക് സ്വാഗതം.', seatbelt: 'ദയവായി സീറ്റ് ബെൽറ്റ് ധരിക്കുക.' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', greeting: 'नमस्कार! कॅटलॉगमध्ये आपले स्वागत आहे.', seatbelt: 'कृपया सीट बेल्ट लावा.' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', greeting: 'নমস্কার! ক্যাটালগে আপনাকে স্বাগত।', seatbelt: 'অনুগ্রহ করে সিট বেল্ট বাঁধুন।' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', greeting: 'નમસ્તે! કેટલોગમાં આપનું સ્વાગત છે.', seatbelt: 'કૃપા કરીને સીટ બેલ્ટ બાંધો.' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੈਟਾਲੌਗ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ।', seatbelt: 'ਕਿਰਪਾ ਕਰਕੇ ਸੀਟ ਬੈਲਟ ਲਗਾਓ।' },
];

export const LANGUAGE_STORAGE_KEY = 'cabwise.safety-audio-language';
export const getSafetyLanguage = code => SAFETY_LANGUAGES.find(item => item.code === code) || SAFETY_LANGUAGES[0];
