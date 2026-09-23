// Short demo prompts, with generated audio bundled in public/audio/safety.
export const SAFETY_LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', greeting: 'नमस्ते! कैबवाइज़ में आपका स्वागत है।', seatbelt: 'कृपया सीट बेल्ट लगाएँ।' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', greeting: 'வணக்கம்! கேப்வைஸுக்கு வரவேற்கிறோம்.', seatbelt: 'தயவுசெய்து சீட் பெல்ட்டை அணியுங்கள்.' },
  { code: 'en-IN', name: 'English', nativeName: 'English', greeting: 'Hello! Welcome to CabWise.', seatbelt: 'Please fasten your seatbelt.' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', greeting: 'నమస్కారం! క్యాబ్‌వైస్‌కు స్వాగతం.', seatbelt: 'దయచేసి సీటు బెల్ట్ పెట్టుకోండి.' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', greeting: 'ನಮಸ್ಕಾರ! ಕ್ಯಾಬ್‌ವೈಸ್‌ಗೆ ಸ್ವಾಗತ.', seatbelt: 'ದಯವಿಟ್ಟು ಸೀಟ್ ಬೆಲ್ಟ್ ಧರಿಸಿ.' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', greeting: 'നമസ്കാരം! ക്യാബ്‌വൈസിലേക്ക് സ്വാഗതം.', seatbelt: 'ദയവായി സീറ്റ് ബെൽറ്റ് ധരിക്കുക.' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', greeting: 'नमस्कार! कॅबवाइसमध्ये आपले स्वागत आहे.', seatbelt: 'कृपया सीट बेल्ट लावा.' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', greeting: 'নমস্কার! ক্যাবওয়াইজে আপনাকে স্বাগত।', seatbelt: 'অনুগ্রহ করে সিট বেল্ট বাঁধুন।' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', greeting: 'નમસ્તે! કેબવાઇઝમાં આપનું સ્વાગત છે.', seatbelt: 'કૃપા કરીને સીટ બેલ્ટ બાંધો.' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੈਬਵਾਈਜ਼ ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ।', seatbelt: 'ਕਿਰਪਾ ਕਰਕੇ ਸੀਟ ਬੈਲਟ ਲਗਾਓ।' },
];

export const LANGUAGE_STORAGE_KEY = 'cabwise.safety-audio-language';
export const getSafetyLanguage = code => SAFETY_LANGUAGES.find(item => item.code === code) || SAFETY_LANGUAGES[0];
