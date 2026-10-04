# CourseKeeper

**English** | [Türkçe](README.tr.md)

A personal academic tracker for university students. Keep your courses, exams, grades, attendance and GPA on a single screen. Runs locally on a Mac; your data stays on your computer.

The interface and code are in Turkish, since the app is built around the grading system used at Turkish universities (AA–DD letter grades).



https://github.com/user-attachments/assets/74a04834-2f04-435e-a368-fb425d51df50



## Features

**Weekly schedule**
- Courses and exams appear as colored blocks on a weekly calendar.
- Overlapping courses and exams are drawn without hiding each other.

**Adding courses from a syllabus**
- Upload a course syllabus (PDF, PNG or JPG) and Gemini extracts the course code, credits, ECTS, class hours, classrooms, attendance limit and grading components.
- Nothing is saved until you review it: the extracted data fills a form, and fields the model was unsure about, or times that were rounded, are highlighted in yellow.
- Information that isn't in the document is never invented; those fields are left empty. Courses can also be added manually.

**Grade calculator**
- Pick a target letter grade (AA–DD) for each course.
- Based on the grades you enter, the app shows your current score, your current letter level and what you need on the remaining exams to reach your target.
- Grading schemes that add up to more than 100% (extra credit) are supported.

**Attendance**
- Attendance is tracked per class hour: missing only one hour of a two-hour class counts as one hour of absence.
- Statuses: attended, absent, attendance not taken, class cancelled.
- Lectures and labs can have separate absence limits, and you get a warning as you approach a limit.

**Semester and GPA**
- Fill in semester dates, holidays and exam periods by reading your university's academic calendar from a web page, PDF or image.
- Enter your previous credits and GPA to see your projected cumulative GPA based on your target grades. GPA can be calculated with local credits or ECTS.

**Other**
- Overview panel: weather, semester progress and next exam.
- Search across courses, exams and notes (⌘K).
- Light and dark themes.

## Installation

Requirements: macOS, Python 3 and (for reading syllabi and academic calendars) a Gemini API key.

1. Clone the project:
   ```bash
   git clone https://github.com/MertCodur-0/CourseKeeper.git
   cd CourseKeeper
   ```

2. Create the settings file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your key to the `GEMINI_API_KEY=` line. You can get a free key from [Google AI Studio](https://aistudio.google.com/apikey). The app runs without a key; only syllabus and academic calendar reading will be unavailable.

3. Double-click `baslat.command`.
   On the first run it installs the required packages, then opens the app in your browser at `http://127.0.0.1:5001`. To stop it, press `Ctrl+C` in the Terminal window that opens.

   > If macOS won't let you open the file: right-click it → **Open**.

To start it from the terminal instead:
```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python app.py
```

## Data and privacy

- All your data is stored in `derstakip.db` in the project folder. This file and `.env` are not committed to git.
- The app is only reachable from your own computer (`127.0.0.1`).
- The internet is used only for:
  - Reading syllabi and academic calendars (the uploaded file is sent to the Gemini API and is not stored by the app),
  - Weather ([Open-Meteo](https://open-meteo.com), no key needed; your location is rounded to about 1 km before it is sent).
- Back up `derstakip.db` regularly.

## Tech stack

- **Server:** Python, Flask
- **Database:** SQLite
- **Frontend:** HTML, CSS and plain JavaScript (no external libraries or fonts)
- **Document reading:** Google Gemini API with structured JSON output. The reading code is provider-independent; to add another model, subclass `SyllabusParser` in `syllabus.py`.

## Project structure

```
app.py               Server, database and API
syllabus.py          Syllabus reading (Gemini)
akademik_takvim.py   Academic calendar reading (web page or file)
hava.py              Weather (Open-Meteo)
templates/index.html Page
static/              JavaScript and CSS
baslat.command       Double-click launcher
```

## Notes

- Grading uses an absolute scale: AA 90–100, BA 85–89, BB 80–84, CB 75–79, CC 70–74, DC 60–69, DD 50–59, F 0–49. Curved (relative) grading is not supported. The scale is defined in the `NOT_OLCEGI` list in `app.py`.
- The calendar shows 09:00–21:00 and whole hours only.
