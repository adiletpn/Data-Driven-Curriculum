"""Curriculum + ground-truth configuration for the synthetic dataset.

Everything marked as *truth* here is hidden from the analytics layer. The
analytics only ever sees the CSV tables a real methodologist would have
(schools, classes, hours, items, responses). The validation module later
compares what the analytics recovered against these planted facts.
"""

DISTRICTS = [
    "г. Тараз", "Байзакский р-н", "Жамбылский р-н", "Жуалынский р-н",
    "Кордайский р-н", "Меркенский р-н", "Мойынкумский р-н", "р-н Т. Рыскулова",
    "Сарысуский р-н", "Таласский р-н", "Шуский р-н",
]

SUBJECTS = [
    {"subject_id": "ALG7", "name": "Алгебра", "name_kz": "Алгебра", "grade": 7, "total_hours": 102},
    {"subject_id": "GEO7", "name": "Геометрия", "name_kz": "Геометрия", "grade": 7, "total_hours": 68},
]

# Fictional publishers — names intentionally do not match real KZ publishers.
TEXTBOOKS = [
    {"textbook_id": "ALG-A", "subject_id": "ALG7", "title": "Алгебра 7 (Альфа)", "publisher": "Альфа-Пресс"},
    {"textbook_id": "ALG-B", "subject_id": "ALG7", "title": "Алгебра 7 (Білім)", "publisher": "Білім-Плюс"},
    {"textbook_id": "ALG-C", "subject_id": "ALG7", "title": "Алгебра 7 (Нұр)", "publisher": "Нұр-Оқу"},
    {"textbook_id": "GEO-A", "subject_id": "GEO7", "title": "Геометрия 7 (Альфа)", "publisher": "Альфа-Пресс"},
    {"textbook_id": "GEO-B", "subject_id": "GEO7", "title": "Геометрия 7 (Білім)", "publisher": "Білім-Плюс"},
]

# Topic fields:
#   id, section, section_kz, name, name_kz, planned_hours, prereqs
#   truth: b = difficulty, L = max learning gain, tau = hours scale of saturation,
#          rho = {prereq: true dependency strength}
TOPICS = [
    # ---------------- Алгебра 7 ----------------
    dict(id="A01", s="ALG7", section="Степени", section_kz="Дәрежелер",
         name="Степень с натуральным показателем", name_kz="Натурал көрсеткішті дәреже",
         hours=6, prereqs=[], b=-0.6, L=1.2, tau=3.0, rho={}),
    dict(id="A02", s="ALG7", section="Степени", section_kz="Дәрежелер",
         name="Степень с целым показателем", name_kz="Бүтін көрсеткішті дәреже",
         hours=6, prereqs=["A01"], b=0.1, L=1.2, tau=4.0, rho={"A01": 0.55}),
    dict(id="A03", s="ALG7", section="Степени", section_kz="Дәрежелер",
         name="Стандартный вид числа", name_kz="Санның стандарт түрі",
         hours=4, prereqs=["A02"], b=-0.2, L=1.0, tau=2.5, rho={"A02": 0.35}),
    dict(id="A04", s="ALG7", section="Одночлены и многочлены", section_kz="Біргемүшелер мен көпмүшелер",
         name="Одночлены", name_kz="Біргемүшелер",
         hours=5, prereqs=["A01"], b=-0.4, L=1.1, tau=3.0, rho={"A01": 0.45}),
    dict(id="A05", s="ALG7", section="Одночлены и многочлены", section_kz="Біргемүшелер мен көпмүшелер",
         name="Сложение и вычитание многочленов", name_kz="Көпмүшелерді қосу және азайту",
         hours=6, prereqs=["A04"], b=-0.3, L=1.1, tau=3.0, rho={"A04": 0.5}),
    dict(id="A06", s="ALG7", section="Одночлены и многочлены", section_kz="Біргемүшелер мен көпмүшелер",
         name="Умножение многочленов", name_kz="Көпмүшелерді көбейту",
         hours=6, prereqs=["A05"], b=0.2, L=1.2, tau=4.5, rho={"A05": 0.6}),
    dict(id="A07", s="ALG7", section="Одночлены и многочлены", section_kz="Біргемүшелер мен көпмүшелер",
         name="Разложение многочленов на множители", name_kz="Көпмүшені көбейткіштерге жіктеу",
         hours=8, prereqs=["A06"], b=1.8, L=3.2, tau=14.0, rho={"A06": 0.7}),          # HARD, underfunded
    dict(id="A08", s="ALG7", section="Формулы сокращённого умножения", section_kz="Қысқаша көбейту формулалары",
         name="Квадрат суммы и разности", name_kz="Қосынды мен айырманың квадраты",
         hours=6, prereqs=["A06"], b=0.1, L=1.2, tau=4.0, rho={"A06": 0.5}),
    dict(id="A09", s="ALG7", section="Формулы сокращённого умножения", section_kz="Қысқаша көбейту формулалары",
         name="Разность квадратов, сумма и разность кубов", name_kz="Квадраттар айырмасы, кубтар қосындысы мен айырмасы",
         hours=6, prereqs=["A08"], b=0.4, L=1.2, tau=5.0, rho={"A08": 0.55}),
    dict(id="A10", s="ALG7", section="Формулы сокращённого умножения", section_kz="Қысқаша көбейту формулалары",
         name="Применение формул к разложению на множители", name_kz="Формулаларды көбейткіштерге жіктеуге қолдану",
         hours=6, prereqs=["A07", "A09"], b=1.6, L=3.0, tau=12.0, rho={"A07": 0.65, "A09": 0.35}),  # HARD (root cause: A07)
    dict(id="A11", s="ALG7", section="Алгебраические дроби", section_kz="Алгебралық бөлшектер",
         name="Сокращение алгебраических дробей", name_kz="Алгебралық бөлшектерді қысқарту",
         hours=6, prereqs=["A10"], b=0.6, L=1.3, tau=6.0, rho={"A10": 0.6}),
    dict(id="A12", s="ALG7", section="Алгебраические дроби", section_kz="Алгебралық бөлшектер",
         name="Действия с алгебраическими дробями", name_kz="Алгебралық бөлшектерге амалдар",
         hours=8, prereqs=["A11"], b=1.9, L=3.4, tau=16.0, rho={"A11": 0.6}),         # HARD, underfunded
    dict(id="A13", s="ALG7", section="Алгебраические дроби", section_kz="Алгебралық бөлшектер",
         name="Преобразование рациональных выражений", name_kz="Рационал өрнектерді түрлендіру",
         hours=6, prereqs=["A12"], b=1.0, L=0.8, tau=1.5, rho={"A12": 0.75}),  # WEAK but saturated: root cause is A12, hours do not help
    dict(id="A14", s="ALG7", section="Функции", section_kz="Функциялар",
         name="Понятие функции и способы задания", name_kz="Функция ұғымы және берілу тәсілдері",
         hours=5, prereqs=[], b=-0.5, L=1.0, tau=2.0, rho={}),
    dict(id="A15", s="ALG7", section="Функции", section_kz="Функциялар",
         name="Линейная функция и её график", name_kz="Сызықтық функция және оның графигі",
         hours=6, prereqs=["A14"], b=-0.7, L=1.0, tau=1.5, rho={"A14": 0.4}),          # EASY, saturated
    dict(id="A16", s="ALG7", section="Функции", section_kz="Функциялар",
         name="Функции y = x² и y = x³", name_kz="y = x² және y = x³ функциялары",
         hours=4, prereqs=["A14", "A01"], b=0.0, L=1.0, tau=2.5, rho={"A14": 0.4, "A01": 0.0}),  # A01 link is nominal only
    dict(id="A17", s="ALG7", section="Элементы статистики", section_kz="Статистика элементтері",
         name="Статистические характеристики", name_kz="Статистикалық сипаттамалар",
         hours=4, prereqs=[], b=-0.9, L=0.9, tau=1.0, rho={}),                         # EASY, saturated
    # ---------------- Геометрия 7 ----------------
    dict(id="G01", s="GEO7", section="Начальные сведения", section_kz="Бастапқы мағлұматтар",
         name="Точка, прямая, отрезок, луч", name_kz="Нүкте, түзу, кесінді, сәуле",
         hours=5, prereqs=[], b=-0.9, L=1.0, tau=1.5, rho={}),                         # EASY, saturated
    dict(id="G02", s="GEO7", section="Начальные сведения", section_kz="Бастапқы мағлұматтар",
         name="Углы и их измерение", name_kz="Бұрыштар және оларды өлшеу",
         hours=6, prereqs=["G01"], b=-0.4, L=1.0, tau=2.0, rho={"G01": 0.4}),
    dict(id="G03", s="GEO7", section="Начальные сведения", section_kz="Бастапқы мағлұматтар",
         name="Смежные и вертикальные углы", name_kz="Сыбайлас және вертикаль бұрыштар",
         hours=5, prereqs=["G02"], b=-0.2, L=1.0, tau=3.0, rho={"G02": 0.5}),
    dict(id="G04", s="GEO7", section="Параллельные прямые", section_kz="Параллель түзулер",
         name="Признаки параллельности прямых", name_kz="Түзулердің параллельдік белгілері",
         hours=8, prereqs=["G03"], b=1.65, L=3.0, tau=12.0, rho={"G03": 0.6}),          # HARD
    dict(id="G05", s="GEO7", section="Параллельные прямые", section_kz="Параллель түзулер",
         name="Свойства параллельных прямых", name_kz="Параллель түзулердің қасиеттері",
         hours=6, prereqs=["G04"], b=0.75, L=0.8, tau=1.5, rho={"G04": 0.75}),  # WEAK but saturated: root cause is G04
    dict(id="G06", s="GEO7", section="Треугольники", section_kz="Үшбұрыштар",
         name="Треугольник и его элементы", name_kz="Үшбұрыш және оның элементтері",
         hours=5, prereqs=["G02"], b=-0.5, L=1.0, tau=2.0, rho={"G02": 0.4}),
    dict(id="G07", s="GEO7", section="Треугольники", section_kz="Үшбұрыштар",
         name="Признаки равенства треугольников", name_kz="Үшбұрыштар теңдігінің белгілері",
         hours=9, prereqs=["G06"], b=1.95, L=3.4, tau=16.0, rho={"G06": 0.6}),          # HARD, underfunded
    dict(id="G08", s="GEO7", section="Треугольники", section_kz="Үшбұрыштар",
         name="Сумма углов треугольника", name_kz="Үшбұрыш бұрыштарының қосындысы",
         hours=6, prereqs=["G05", "G06"], b=0.2, L=1.1, tau=4.0, rho={"G05": 0.5, "G06": 0.3}),
    dict(id="G09", s="GEO7", section="Треугольники", section_kz="Үшбұрыштар",
         name="Прямоугольный треугольник", name_kz="Тікбұрышты үшбұрыш",
         hours=6, prereqs=["G07", "G08"], b=0.5, L=1.2, tau=5.0, rho={"G07": 0.5, "G08": 0.3}),
    dict(id="G10", s="GEO7", section="Окружность", section_kz="Шеңбер",
         name="Окружность, касательная", name_kz="Шеңбер, жанама",
         hours=6, prereqs=["G01"], b=0.0, L=1.0, tau=2.5, rho={"G01": 0.3}),
    dict(id="G11", s="GEO7", section="Окружность", section_kz="Шеңбер",
         name="Задачи на построение", name_kz="Салуға берілген есептер",
         hours=6, prereqs=["G10", "G07"], b=1.6, L=2.8, tau=11.0, rho={"G10": 0.4, "G07": 0.5}),  # HARD
]

# Truth: textbook effect per section (logit units, relative to the 'A' book).
TEXTBOOK_SECTION_EFFECTS = {
    "ALG-A": {},
    "ALG-B": {"Формулы сокращённого умножения": 0.25, "Алгебраические дроби": 0.30,
              "Одночлены и многочлены": 0.15, "_default": 0.0},
    "ALG-C": {"Функции": 0.35, "Алгебраические дроби": -0.30, "_default": 0.0},
    "GEO-A": {},
    "GEO-B": {"Треугольники": 0.40, "Параллельные прямые": 0.20, "Окружность": -0.20, "_default": 0.05},
}

# Truth: Kazakh-language edition of 'Альфа' books has a weak translation.
TEXTBOOK_LANGUAGE_INTERACTION = {("ALG-A", "kz"): -0.30}

# Truth: probability that a school picks each textbook depends on how strong
# and how urban the school is -> naive comparison is confounded (Simpson).
TEXTBOOK_CHOICE = {
    "ALG7": {"urban_strong": [0.85, 0.05, 0.10], "urban_weak": [0.30, 0.45, 0.25],
             "rural": [0.08, 0.72, 0.20]},
    "GEO7": {"urban_strong": [0.88, 0.12], "urban_weak": [0.45, 0.55], "rural": [0.12, 0.88]},
}

# Truth: defective test items.
#   wrong_key: published key points to a distractor; true answer is another option.
#   noise: item is ambiguous -> answers are near-random.
#   trivial: item gives away the answer.
DEFECTIVE_ITEMS = {
    "A07-Q3": "wrong_key",
    "A12-Q5": "noise",
    "A03-Q2": "trivial",
    "G07-Q4": "wrong_key",
    "G04-Q6": "noise",
}

ITEMS_PER_TOPIC = 6
