"""Evidence-based cached lessons with a deterministic, reviewable Hindi fallback."""
import hashlib
import json
import os
import re
from urllib.request import Request, urlopen
from pydantic import BaseModel, Field, ConfigDict
from models import Lesson, LessonDetails

SCRIPTS = {
    'idle': ('Reduce unnecessary idle time', 'मशीन का खाली चलना हमेशा गलती नहीं है। काम शुरू करने से पहले अगला काम, रास्ता और सामग्री की तैयारी देखें। प्रतीक्षा का कारण समझें और पर्यवेक्षक से बात करें। यदि मशीन रोकनी हो तो निर्माता की संचालन पुस्तिका और साइट के नियमों का पालन करें। केवल फोन के स्थिर रहने से इंजन चालू होने का पता नहीं चलता। फोन के अनुमान को वास्तविक मशीन की जाँच से मिलाएँ। लोड चक्र और ईंधन के आँकड़े एक जैसे कामों के बीच ही तुलना करें। गर्मी, रखरखाव और काम की आवश्यकता भी समय बदल सकती है। अगली शिफ्ट में अनावश्यक प्रतीक्षा का एक कारण पहचानें और टीम के साथ सुधार करें। सुरक्षा को बचत से पहले रखें।'),
    'fuel': ('Review fuel and cycle measurements', 'ईंधन प्रति चक्र का बढ़ना जाँच का संकेत है, ऑपरेटर की गलती का प्रमाण नहीं। पहले ईंधन और चक्र की माप सही होने की पुष्टि करें। अलग काम, भार, मिट्टी और प्रतीक्षा का समय परिणाम बदल सकते हैं। केवल समान परिस्थितियों वाले काम की तुलना करें। मशीन की दैनिक जाँच करें और रिसाव या खराबी की सूचना पर्यवेक्षक को दें। चलती मशीन के पास रिसाव जाँचने या मरम्मत करने का प्रयास न करें। मशीन बंद करने और रखरखाव के लिए निर्माता की पुस्तिका और साइट प्रक्रिया अपनाएँ। तेज चलाकर या अतिरिक्त भार लेकर आँकड़े सुधारने की कोशिश न करें। अगली शिफ्ट में सही माप दर्ज करें और टीम के साथ अनावश्यक प्रतीक्षा कम करने का सुरक्षित तरीका चुनें।'),
    'seatbelt': ('Build a seatbelt check habit', 'मशीन चलाने से पहले सीट बेल्ट की जाँच को अपनी आदत बनाएँ। बेल्ट, बकल और दिखाई देने वाले हिस्सों को देखें। खराबी हो तो मशीन का उपयोग शुरू करने से पहले पर्यवेक्षक को बताएँ। सीट पर सही बैठें और निर्माता के निर्देशों के अनुसार बेल्ट लगाएँ। काम छोटा हो तब भी यह जाँच न छोड़ें। ऐप में दिखाई देने वाला नमूना असली मशीन की बेल्ट की स्थिति नहीं बताता। बेल्ट लगी होने की पुष्टि स्वयं करें। मशीन चलने के दौरान फोन पर ध्यान न दें। कोई चेतावनी दिखे तो साइट की सुरक्षित रुकने की प्रक्रिया अपनाएँ। फोन का संदेश मशीन के सुरक्षा उपकरणों का विकल्प नहीं है। हर शिफ्ट से पहले रुकें, जाँचें और फिर काम शुरू करें।'),
    'overrun': ('Review the plan before the next task', 'काम में अनुमान से अधिक समय लगना अपने आप में खराब संचालन का प्रमाण नहीं है। मौसम, मिट्टी, रास्ता, मशीन की स्थिति और प्रतीक्षा सभी समय बदल सकते हैं। अगला काम शुरू करने से पहले कार्य योजना और साइट के खतरों की समीक्षा करें। सामग्री रखने की जगह और लोगों की आवाजाही का रास्ता टीम के साथ तय करें। अनुमान पूरा करने के लिए गति या भार की सुरक्षित सीमा न बदलें। कठिनाई हो तो पर्यवेक्षक से मदद लें। वास्तविक समय और देरी का कारण सही दर्ज करें। ऐप का समय अनुमान केवल योजना में मदद करता है। यह काम जल्दी पूरा करने का निर्देश नहीं है। अपने अनुभव से एक सुधार चुनें और अगली शिफ्ट में उसकी समीक्षा करें।'),
    'utility': ('Review utility clearance before digging', 'जमीन के नीचे की सेवाएँ दिखाई नहीं देतीं। खुदाई से पहले अधिकृत साइट प्रक्रिया के अनुसार उपयोगिता नक्शे, अनुमति और वास्तविक चिन्हों की जाँच करवाएँ। फोन का जीपीएस और यह नमूना नक्शा सुरक्षित दूरी की पुष्टि नहीं करते। नक्शे में रेखा न दिखने का अर्थ यह नहीं है कि जमीन खाली है। मशीन के पास चेतावनी मिलने पर सुरक्षित रुकने की प्रक्रिया अपनाएँ और पर्यवेक्षक से संपर्क करें। इस ऐप से बकेट की जगह या गहराई नहीं मापी जाती। ई फेंस या खुदाई की गहराई इस ऐप के आधार पर सेट न करें। अधिकृत व्यक्ति और निर्माता के निर्देशों के बिना खुदाई जारी न रखें। घटना या निकट चूक दर्ज करें ताकि अगली टीम भी खतरे से परिचित रहे।'),
}


def quiz_for(kind):
    first = {
        'idle': ('Does a stationary phone prove the engine is idling?', ['No; confirm engine state and work context', 'Yes, always', 'It proves the engine is off']),
        'fuel': ('What should you do before comparing fuel per cycle?', ['Verify measurements and compare similar work', 'Carry more than the rated load', 'Ignore the task conditions']),
        'seatbelt': ('When should the seatbelt be checked?', ['Before operating, following the machine instructions', 'Only on long tasks', 'Only when an app gives an alert']),
        'overrun': ('Does exceeding an estimate prove poor performance?', ['No; review the work and conditions', 'Yes, in every case', 'It means speed limits should be ignored']),
        'utility': ('Can this sample map provide excavation clearance?', ['No; use the authorised site clearance process', 'Yes, if no line appears', 'Yes, if the phone is online']),
    }[kind]
    questions = [
        {'question': first[0], 'question_hi': 'इस पाठ की मुख्य बात क्या है? सही उत्तर चुनें।', 'options': first[1], 'answer': 0},
        {'question': 'What should you do when uncertain about safe operation?', 'question_hi': 'सुरक्षित संचालन को लेकर संदेह हो तो क्या करें?', 'options': ['Continue without checking', 'Follow site procedures and consult the supervisor', 'Rely only on phone readings'], 'answer': 1},
        {'question': 'What does passing this quiz show?', 'question_hi': 'इस प्रश्नोत्तरी में सफल होने का क्या अर्थ है?', 'options': ['Permission to ignore the manual', 'Certified machine operating skill', 'Completion of this learning check, not certification'], 'answer': 2},
    ]
    translations = {
        'idle': ('क्या स्थिर फोन से इंजन के खाली चलने की पुष्टि होती है?', ['नहीं, इंजन और काम की स्थिति जाँचें', 'हाँ, हमेशा', 'इससे इंजन बंद होने की पुष्टि होती है']),
        'fuel': ('ईंधन प्रति चक्र की तुलना से पहले क्या करें?', ['सही माप और समान काम की पुष्टि करें', 'क्षमता से अधिक भार उठाएँ', 'काम की स्थितियों को अनदेखा करें']),
        'seatbelt': ('सीट बेल्ट कब जाँचें?', ['संचालन से पहले, निर्माता के निर्देशों के अनुसार', 'केवल लंबे काम पर', 'केवल ऐप की चेतावनी पर']),
        'overrun': ('क्या अनुमान से अधिक समय खराब प्रदर्शन का प्रमाण है?', ['नहीं, काम और स्थितियों की समीक्षा करें', 'हाँ, हर बार', 'गति सीमा को अनदेखा करें']),
        'utility': ('क्या यह नमूना नक्शा खुदाई की अनुमति देता है?', ['नहीं, अधिकृत साइट प्रक्रिया अपनाएँ', 'हाँ, यदि रेखा न दिखे', 'हाँ, यदि फोन ऑनलाइन हो']),
    }
    questions[0]['question_hi'], first_options = translations[kind]
    all_options = [first_options, ['बिना जाँच काम जारी रखें', 'साइट प्रक्रिया अपनाएँ और पर्यवेक्षक से पूछें', 'केवल फोन पर भरोसा करें'],
                   ['पुस्तिका अनदेखी करने की अनुमति', 'प्रमाणित मशीन संचालन कौशल', 'इस पाठ की समझ की जाँच पूरी हुई, प्रमाणन नहीं']]
    for question, hindi_options in zip(questions, all_options):
        question['options'] = [f'{hi} / {en}' for hi, en in zip(hindi_options, question['options'])]
    return questions


def build_lesson(operator_id, flag):
    kind = flag['kind']
    title, script = SCRIPTS[kind]
    evidence = {'kind': kind, 'reason': flag['reason'], 'values': flag['evidence']}
    identifier = hashlib.sha256(json.dumps([operator_id, evidence, 'coach-v1'], sort_keys=True).encode()).hexdigest()[:32]
    values = flag['evidence']
    if kind == 'idle' and values.get('idling_time_min') is not None:
        script = f"चुने गए रिकॉर्ड में {values['idling_time_min']:g} मिनट खाली समय दर्ज है। " + script
    lesson = Lesson(id=identifier, operator_id=operator_id, title=title, trigger=kind, script_hi=script, quiz=quiz_for(kind))
    details = LessonDetails(id=identifier, evidence=evidence, source='evidence_template')
    return lesson, details


class GeneratedQuestion(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=10, max_length=300)
    question_hi: str = Field(min_length=10, max_length=400)
    options: list[str] = Field(min_length=3, max_length=3)
    answer: int = Field(ge=0, le=2)


class GeneratedLesson(BaseModel):
    model_config = ConfigDict(extra='forbid')
    script_hi: str = Field(min_length=200, max_length=2500)
    quiz: list[GeneratedQuestion] = Field(min_length=3, max_length=3)


def personalise(lesson, details):
    """Fail closed to a fixed lesson; never send IDs, coordinates or report text."""
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return lesson, details
    model = os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite')
    if not re.fullmatch(r'gemini-[a-zA-Z0-9.-]+', model):
        return lesson, details
    values = {k: v for k, v in details.evidence['values'].items() if k in
              ('idling_time_min', 'load_cycles', 'fuel_used_l', 'litres_per_cycle', 'episodes', 'estimated_time_min', 'actual_time_min') and isinstance(v, (int, float))}
    prompt = ('Write a roughly 60-second Hindi learning card and exactly three bilingual quiz questions. '
              'Use only the following numeric evidence and fixed guidance. Do not infer dates or live machine state. '
              'Do not give machine settings, clearance distances, excavation permission, shutdown commands or certifications. '
              'Refer to manufacturer instructions and authorised site procedures. Options must include Hindi and English. '
              'Return JSON only. Evidence: ' + json.dumps(values) + '\nFixed guidance: ' + SCRIPTS[lesson.trigger][1])
    payload = {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {
        'responseMimeType': 'application/json', 'responseJsonSchema': GeneratedLesson.model_json_schema(),
        'temperature': .2, 'maxOutputTokens': 3000}}
    try:
        req = Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                      data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        with urlopen(req, timeout=8) as response:
            result = json.loads(response.read(100000))
        content = ''.join(part.get('text', '') for part in result['candidates'][0]['content']['parts'])
        parsed = GeneratedLesson.model_validate_json(content)
        if not re.search('[\u0900-\u097f]', parsed.script_hi):
            return lesson, details
        lesson.script_hi = parsed.script_hi
        lesson.quiz = [q.model_dump() for q in parsed.quiz]
        details.source = 'gemini_draft'
    except Exception:
        # Credentials/provider responses never appear in logs or client errors.
        details.source = 'template_provider_unavailable'
    return lesson, details
