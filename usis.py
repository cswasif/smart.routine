import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import re
from datetime import datetime, timezone, timedelta
import json
import pytz
import demjson3
import json as pyjson

app = Flask(__name__)
CORS(app)
DATA_URL = "https://usis-cdn.eniamza.com/connect.json"
data = requests.get(DATA_URL).json()
print(f"Loaded {len(data)} sections")

# Add at the top of usis.py
BD_TIMEZONE = pytz.timezone('Asia/Dhaka')

# --- PATCH: Ensure all sections have exam date/time fields (replace with real data if available) ---
for idx, section in enumerate(data):
    # Example: Assign different dates/times for each section for demo purposes
    # In production, replace this logic with real exam schedule assignment!
    if "midExamDate" not in section or not section.get("midExamDate"):
        section["midExamDate"] = f"2024-07-{10 + (idx % 10):02d}"
        section["midExamStartTime"] = "10:00"
        section["midExamEndTime"] = "12:00"
    if "finalExamDate" not in section or not section.get("finalExamDate"):
        section["finalExamDate"] = f"2024-08-{20 + (idx % 10):02d}"
        section["finalExamStartTime"] = "14:00"
        section["finalExamEndTime"] = "16:00"

def convert_to_bd_time(time_str):
    """Convert time string to Bangladesh timezone."""
    try:
        # Parse the time string
        time_obj = datetime.strptime(time_str, "%H:%M:%S").time()
        # Create a datetime object for today with the time
        dt = datetime.now().replace(
            hour=time_obj.hour,
            minute=time_obj.minute,
            second=time_obj.second,
            microsecond=0
        )
        # Convert to Bangladesh timezone
        bd_dt = BD_TIMEZONE.localize(dt)
        return bd_dt.strftime("%H:%M:%S")
    except Exception as e:
        print(f"Error converting time: {e}")
        return time_str

def time_to_minutes(tstr):
    """Convert time string to minutes (handles both 24-hour and 12-hour formats)."""
    for fmt in ("%H:%M:%S", "%I:%M %p"):
        try:
            dt = datetime.strptime(tstr.strip(), fmt)
            return dt.hour * 60 + dt.minute
        except Exception:
            continue
    print(f"Error in time_to_minutes: {tstr}")
    return 0

# Helper function to format 24-hour time string to 12-hour AM/PM
def convert_time_24_to_12(text):
    def repl(match):
        t = match.group(0)
        t = t[:5]
        in_time = datetime.strptime(t, "%H:%M")
        return in_time.strftime("%#I:%M %p") # Use %#I for Windows, %-I for others
    return re.sub(r"\b([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b", repl, text)

# Define your time slots (should match frontend)
TIME_SLOTS = [
    "8:00 AM-9:20 AM",
    "9:30 AM-10:50 AM",
    "11:00 AM-12:20 PM",
    "12:30 PM-1:50 PM",
    "2:00 PM-3:20 PM",
    "3:30 PM-4:50 PM",
    "5:00 PM-6:20 PM"
]

def parse_time(tstr):
    return datetime.strptime(tstr, "%I:%M %p")

def slot_to_minutes(slot):
    start_str, end_str = slot.split('-')
    start = parse_time(start_str.strip())
    end = parse_time(end_str.strip())
    return start.hour * 60 + start.minute, end.hour * 60 + end.minute

def schedules_overlap(start1, end1, start2, end2):
    return max(start1, start2) < min(end1, end2)

def exam_schedules_overlap(exam1, exam2):
    """Check if two exam schedules conflict based on date and time."""
    try:
        # First check if the exam dates match
        if exam1.get("examDate") != exam2.get("examDate"):
            return False  # Exams are on different days, no conflict

        # If on the same day, check for time overlap
        start1 = time_to_minutes(exam1.get("startTime", ""))
        end1 = time_to_minutes(exam1.get("endTime", ""))
        start2 = time_to_minutes(exam2.get("startTime", ""))
        end2 = time_to_minutes(exam2.get("endTime", ""))

        # If any of the times are invalid (0), return True to be safe
        if start1 == 0 or end1 == 0 or start2 == 0 or end2 == 0:
            print(f"Warning: Invalid exam time detected. Assuming conflict for safety.")
            return True

        # Check if the time ranges overlap
        return schedules_overlap(start1, end1, start2, end2)
    except Exception as e:
        print(f"Error comparing exam schedules: {e}")
        return True  # Assume conflict if parsing fails, to be safe

def check_exam_conflicts(section1, section2):
    """Check for conflicts between mid-term and final exams of two sections."""
    conflicts = []
    
    # Get all exam schedules
    exams1 = []
    exams2 = []
    
    # Add mid-term exams if they exist
    if section1.get("midExamDate") and section1.get("midExamStartTime") and section1.get("midExamEndTime"):
        exams1.append({
            "examDate": section1["midExamDate"],
            "startTime": section1["midExamStartTime"],
            "endTime": section1["midExamEndTime"],
            "type": "Mid"
        })
    
    if section2.get("midExamDate") and section2.get("midExamStartTime") and section2.get("midExamEndTime"):
        exams2.append({
            "examDate": section2["midExamDate"],
            "startTime": section2["midExamStartTime"],
            "endTime": section2["midExamEndTime"],
            "type": "Mid"
        })
    
    # Add final exams if they exist
    if section1.get("finalExamDate") and section1.get("finalExamStartTime") and section1.get("finalExamEndTime"):
        exams1.append({
            "examDate": section1["finalExamDate"],
            "startTime": section1["finalExamStartTime"],
            "endTime": section1["finalExamEndTime"],
            "type": "Final"
        })
    
    if section2.get("finalExamDate") and section2.get("finalExamStartTime") and section2.get("finalExamEndTime"):
        exams2.append({
            "examDate": section2["finalExamDate"],
            "startTime": section2["finalExamStartTime"],
            "endTime": section2["finalExamEndTime"],
            "type": "Final"
        })
    
    # Check for conflicts between all exam combinations
    for exam1 in exams1:
        for exam2 in exams2:
            if exam_schedules_overlap(exam1, exam2):
                conflicts.append({
                    "course1": section1["courseCode"],
                    "course2": section2["courseCode"],
                    "date": exam1["examDate"],
                    "type1": exam1["type"],
                    "type2": exam2["type"],
                    "time1": f"{exam1['startTime']} - {exam1['endTime']}",
                    "time2": f"{exam2['startTime']} - {exam2['endTime']}"
                })
    
    return conflicts

def has_internal_conflicts(section):
    """Check if a single section has overlapping class or lab schedules."""
    schedules = []
    if section.get("sectionSchedule") and section["sectionSchedule"].get("classSchedules"):
        for sched in section["sectionSchedule"]["classSchedules"]:
            if sched.get("day") and sched.get("startTime") and sched.get("endTime"):
                schedules.append({
                    "day": sched["day"].upper(),
                    "start": time_to_minutes(sched["startTime"]),
                    "end": time_to_minutes(sched["endTime"])
                })

    if section.get("labSchedules"):
        for lab in section["labSchedules"]:
            if lab.get("day") and lab.get("startTime") and lab.get("endTime"):
                schedules.append({
                    "day": lab["day"].upper(),
                    "start": time_to_minutes(lab["startTime"]),
                    "end": time_to_minutes(lab["endTime"])
                })

    # Check for conflicts among all schedules in this section
    for i in range(len(schedules)):
        for j in range(i + 1, len(schedules)):
            if (schedules[i]["day"] == schedules[j]["day"] and
                schedules_overlap(schedules[i]["start"], schedules[i]["end"],
                                schedules[j]["start"], schedules[j]["end"])):
                print(f"Internal conflict found in section {section.get('courseCode')} {section.get('sectionName')}: {schedules[i]} conflicts with {schedules[j]}") # Debug print
                return True

    return False

@app.route("/")
def home():
    return "Flask is running!"

@app.route("/api/courses")
def get_courses():
    # Get unique course codes and names
    courses = {}
    for section in data:
        code = section.get("courseCode")
        name = section.get("courseName", code)
        courses[code] = name
    return jsonify([{"code": k, "name": v} for k, v in courses.items()])

@app.route("/api/course_details")
def course_details():
    code = request.args.get("course")
    # Get all sections for the course
    all_sections = [section for section in data if section.get("courseCode") == code]
    
    # Filter out sections with no available seats
    details = []
    for section in all_sections:
        available_seats = section.get("capacity", 0) - section.get("consumedSeat", 0)
        if available_seats > 0:
            # Add available seats information
            section["availableSeats"] = available_seats
            
            # Format schedule information
            if section.get("sectionSchedule"):
                if section["sectionSchedule"].get("classSchedules"):
                    for schedule in section["sectionSchedule"]["classSchedules"]:
                        schedule["formattedTime"] = convert_time_24_to_12(f"{schedule['startTime']} - {schedule['endTime']}")
            
            # Format lab schedule information
            if section.get("labSchedules"):
                for schedule in section["labSchedules"]:
                    schedule["formattedTime"] = convert_time_24_to_12(f"{schedule['startTime']} - {schedule['endTime']}")
            
            details.append(section)
    
    return jsonify(details)

@app.route("/api/faculty")
def get_faculty():
    # Get unique faculty names from all sections
    faculty = set()
    for section in data:
        if section.get("faculties"):
            faculty.add(section.get("faculties"))
    return jsonify(list(faculty))

@app.route("/api/faculty_for_courses")
def get_faculty_for_courses():
    course_codes = request.args.get("courses", "").split(",")
    faculty = set()
    
    # Get faculty for each course
    for code in course_codes:
        sections = [section for section in data if section.get("courseCode") == code]
        for section in sections:
            if section.get("faculties"):
                faculty.add(section.get("faculties"))
    
    return jsonify(list(faculty))

def get_lab_schedule(section):
    """Extract and format lab schedule information for a section."""
    lab_schedules = section.get("labSchedules", []) or []
    formatted_labs = []
    
    for lab in lab_schedules:
        day = lab.get("day", "").capitalize()
        start = lab.get("startTime")
        end = lab.get("endTime")
        room = lab.get("room", "TBA")
        
        if start and end:
            sched_start = time_to_minutes(start)
            sched_end = time_to_minutes(end)
            formatted_time = convert_time_24_to_12(f"{start} - {end}")
            
            formatted_labs.append({
                "day": day,
                "startTime": start,
                "endTime": end,
                "formattedTime": formatted_time,
                "room": room,
                "startMinutes": sched_start,
                "endMinutes": sched_end
            })
    
    return formatted_labs

def get_lab_schedule_bd(section):
    """Extract and format lab schedule information for a section, converting times to Bangladesh timezone (GMT+6)."""
    lab_schedules = section.get("labSchedules", []) or []
    formatted_labs = []
    for lab in lab_schedules:
        day = lab.get("day", "").capitalize()
        start = lab.get("startTime")
        end = lab.get("endTime")
        room = lab.get("room", "TBA")
        if start and end:
            # Parse as UTC and convert to BD time
            try:
                # Assume input is in HH:MM:SS, treat as naive local time, localize to UTC, then convert
                start_dt = datetime.strptime(start, "%H:%M:%S")
                end_dt = datetime.strptime(end, "%H:%M:%S")
                # Attach today's date for conversion
                today = datetime.now().date()
                start_dt = datetime.combine(today, start_dt.time())
                end_dt = datetime.combine(today, end_dt.time())
                # Localize to UTC, then convert to BD
                start_bd = pytz.utc.localize(start_dt).astimezone(BD_TIMEZONE)
                end_bd = pytz.utc.localize(end_dt).astimezone(BD_TIMEZONE)
                start_str_bd = start_bd.strftime("%H:%M:%S")
                end_str_bd = end_bd.strftime("%H:%M:%S")
                formatted_time = convert_time_24_to_12(f"{start_str_bd} - {end_str_bd}")
                sched_start = time_to_minutes(start_str_bd)
                sched_end = time_to_minutes(end_str_bd)
            except Exception:
                # Fallback: use original times
                start_str_bd = start
                end_str_bd = end
                formatted_time = convert_time_24_to_12(f"{start} - {end}")
                sched_start = time_to_minutes(start)
                sched_end = time_to_minutes(end)
            formatted_labs.append({
                "day": day,
                "startTime": start_str_bd,
                "endTime": end_str_bd,
                "formattedTime": formatted_time,
                "room": room,
                "startMinutes": sched_start,
                "endMinutes": sched_end
            })
    return formatted_labs

def check_lab_conflicts(section1, section2):
    """Check if two sections have conflicting lab schedules."""
    labs1 = get_lab_schedule(section1)
    labs2 = get_lab_schedule(section2)
    
    for lab1 in labs1:
        for lab2 in labs2:
            if (lab1["day"] == lab2["day"] and 
                schedules_overlap(lab1["startMinutes"], lab1["endMinutes"],
                                lab2["startMinutes"], lab2["endMinutes"])):
                return True
    return False

@app.route("/api/routine", methods=["POST"])
def get_routine():
    req = request.json
    course_faculty_pairs = req.get("courses", [])
    selected_days = req.get("days", [])
    selected_times = req.get("times", [])
    use_ai = req.get("useAI", False)
    commute_preference = req.get("commutePreference", "")

    # Convert selected times to minutes for easier comparison
    selected_time_ranges = []
    for time_slot in selected_times:
        start_str, end_str = time_slot.split('-')
        start_minutes = time_to_minutes(start_str.strip())
        end_minutes = time_to_minutes(end_str.strip())
        selected_time_ranges.append((start_minutes, end_minutes))

    # Build candidate sections for each course
    candidates_per_course = {}
    for pair in course_faculty_pairs:
        course_code = pair.get("course")
        faculty_list = pair.get("faculty", [])
        # Get all sections for this course
        course_sections = [
        section for section in data
            if section.get("courseCode", "").upper() == course_code.upper()
        ]
        # Filter by faculty
        if faculty_list:
            if 'TBA' in [f.upper() for f in faculty_list]:
                course_sections = [
                    section for section in course_sections
                    if section.get("faculties", "").upper() in [f.upper() for f in faculty_list]
                ]
            else:
                course_sections = [
                    section for section in course_sections
                    if section.get("faculties") in faculty_list
                ]
        # Filter sections based on schedule matches AND internal conflicts
        filtered_sections = []
        for section in course_sections:
            if has_internal_conflicts(section):
                print(f"Skipping section {section.get('courseCode')} {section.get('sectionName')} due to internal conflicts.")
                continue

            class_schedules = section.get("sectionSchedule", {}).get("classSchedules", [])
            lab_schedules = section.get("labSchedules", []) or []
            section_schedules = []
            # Process class schedules
            class_match = False
            for sched in class_schedules:
                day = sched.get("day", "").upper()
                if day in [d.upper() for d in selected_days]:
                    start = time_to_minutes(sched.get("startTime"))
                    end = time_to_minutes(sched.get("endTime"))
                    section_schedules.append({
                        "type": "class",
                        "day": day,
                        "start": start,
                        "end": end,
                        "schedule": sched
                    })
                    for selected_start, selected_end in selected_time_ranges:
                        if schedules_overlap(start, end, selected_start, selected_end):
                            class_match = True
            # Process lab schedules
            lab_match = False
            for lab in lab_schedules:
                day = lab.get("day", "").upper()
                if day in [d.upper() for d in selected_days]:
                    start_bd_str = convert_to_bd_time(lab.get("startTime"))
                    end_bd_str = convert_to_bd_time(lab.get("endTime"))
                    start = time_to_minutes(start_bd_str)
                    end = time_to_minutes(end_bd_str)
                    formatted_time = convert_time_24_to_12(f"{start_bd_str} - {end_bd_str}")
                    section_schedules.append({
                        "type": "lab",
                        "day": day,
                        "start": start,
                        "end": end,
                        "schedule": lab,
                        "formattedTime": formatted_time
                    })
                for selected_start, selected_end in selected_time_ranges:
                        if schedules_overlap(start, end, selected_start, selected_end):
                            lab_match = True
            if class_match and (not lab_schedules or lab_match):
                section["formattedSchedules"] = section_schedules
                filtered_sections.append(section)
        candidates_per_course[course_code] = filtered_sections

    if use_ai:
        # Call Gemini API
        prompt = (
            f"You are a university routine generator for Bangladesh timezone (GMT+6). "
            f"Given the following possible course sections (grouped by course):\n{json.dumps(candidates_per_course)}\n"
            f"The student's desired faculty for each course is: {course_faculty_pairs}\n"
            f"The student's available days are: {selected_days}\n"
            f"The student's available times are: {selected_times}\n"
            f"The student's commute preference is: {commute_preference}. "
            f"Consider this preference when generating the routine.\n"
            f"1. Matches the user's desired faculty\n"
            f"2. All class and lab schedules fall within the selected days and times\n"
            f"3. **ABSOLUTELY CRITICAL: Ensure there are NO time conflicts whatsoever between any selected sections on the same day.** This is non-negotiable. A student CANNOT be in two places at once. Do not schedule classes or labs that overlap in time on the same day.\n"
            f"4. **Commute Preference Strategy:**\n"
            f"   - If 'far': Regardless of the total number of days the student selected, first attempt to fit all courses into a routine spanning ANY 2 days from the student's selected days. If that's impossible without conflicts, then try ANY 3 selected days, then ANY 4, and so on, up to the total number of selected days. Prioritize putting multiple classes on the same day if it avoids conflicts and reduces the number of days needed.\n"
            f"   - If 'near': Prioritize spreading out classes over more of the student's selected days to reduce daily workload. FIRST, try to schedule at most ONE class per selected day, ensuring no time conflicts. If this is not possible to accommodate all courses within the selected days without conflicts, THEN allow scheduling multiple classes on a day, still aiming to spread them out but prioritizing fitting within selected days without conflicts.\n"
            f"5. **ABSOLUTELY CRITICAL: For any single course, NEVER schedule its lab and class schedules to overlap in time on the same day.** This is a strict rule that must be followed.\n"
            f"6. If a course has multiple possible timings without conflicts (including no lab/class conflict for that course), choose the timing that best fits the commute preference and avoids creating conflicts with other selected courses.\n"
            f"7. **ABSOLUTELY CRITICAL: Ensure there are NO conflicts between the mid-term and final exam dates and times of any selected sections.** A student cannot have two exams at the same time.\n"
            f"8. If after reviewing all possible valid sections for the selected courses, it is IMPOSSIBLE to create a routine without any time conflicts (including class-class, lab-lab, class-lab for the same course, and exam date conflicts) that meets ALL selected criteria (days, times, faculty, and fitting within the selected days), then you MUST return an empty array []. Do NOT return a routine with any conflicts.\n"
            f"9. Return ONLY a valid JSON array. Each object in the array should represent a selected section and MUST include the following keys: 'courseCode', 'sectionId', 'sectionName', 'faculties', 'roomName', 'labRoomName', 'sectionSchedule', 'labSchedules', 'midExamDate', 'midExamStartTime', 'midExamEndTime', 'finalExamDate', 'finalExamStartTime', 'finalExamEndTime', and 'formattedSchedules'. Ensure that 'formattedSchedules' contains all matching class and lab schedules. Do not include any explanation, markdown, or extra text. Make sure all brackets and braces are closed and there are no trailing commas."
        )

        try:
            model = genai.GenerativeModel('gemini-1.5-flash-001')
            response = model.generate_content(prompt)
            routine_text = response.text.strip()
            print("Gemini raw response:", routine_text)

            # Attempt to parse the JSON response and extract feedback
            routine_sections = []
            feedback = None

            # Extract potential JSON array and feedback
            json_start_index = routine_text.find('[')
            json_end_index = routine_text.rfind(']')
            routine_json_str = ""
            if json_start_index != -1 and json_end_index != -1 and json_end_index > json_start_index:
                routine_json_str = routine_text[json_start_index : json_end_index + 1]

            feedback_match = re.search(r'Feedback:\s*(.*)', routine_text)

            if feedback_match:
                feedback = feedback_match.group(1).strip()

            if routine_json_str:
                routine_json_str = auto_fix_json(routine_json_str)
                try:
                    routine_sections = pyjson.loads(routine_json_str)
                except Exception as e:
                    print(f"Standard JSON parse failed for extracted Gemini response: {e}")
                    try:
                        routine_sections = demjson3.decode(routine_json_str)
                    except Exception as e2:
                        print(f"demjson3 parse failed for extracted Gemini response: {e2}")

            # Check for exam conflicts in the generated routine
            if routine_sections:
                exam_conflicts = []
                for i in range(len(routine_sections)):
                    section1 = routine_sections[i]
                    for j in range(i + 1, len(routine_sections)):
                        section2 = routine_sections[j]
                        conflicts = check_exam_conflicts(section1, section2)
                        exam_conflicts.extend(conflicts)

                if exam_conflicts:
                    error_message = "Cannot generate routine due to exam conflicts:\n\n"
                    for conflict in exam_conflicts:
                        error_message += f"- {conflict['course1']} ({conflict['type1']}) and {conflict['course2']} ({conflict['type2']}) have exams on {conflict['date']}:\n"
                        error_message += f"  {conflict['course1']}: {conflict['time1']}\n"
                        error_message += f"  {conflict['course2']}: {conflict['time2']}\n\n"
                    error_message += "Please select different sections to avoid exam conflicts."
                    return jsonify({"error": error_message}), 200

            # If no valid routine sections were parsed from Gemini's response
            if not routine_sections:
                return jsonify({"error": "AI could not generate a valid routine with the selected options.", "feedback": feedback}), 200

            # Find the original, complete section objects and build formattedSchedules
            final_routine_sections_ai = []
            selected_section_ids_ai = [s.get("sectionId") for s in routine_sections if s and s.get("sectionId")]

            for original_section in data:
                if original_section.get("sectionId") in selected_section_ids_ai:
                    class_schedules = original_section.get("sectionSchedule", {}).get("classSchedules", [])
                    lab_schedules = original_section.get("labSchedules", []) or []
                    section_schedules = []

                    for sched in class_schedules:
                        day = sched.get("day", "").upper()
                        start = time_to_minutes(sched.get("startTime"))
                        end = time_to_minutes(sched.get("endTime"))
                        section_schedules.append({
                            "type": "class",
                            "day": day,
                            "start": start,
                            "end": end,
                            "schedule": sched,
                            "formattedTime": sched.get("formattedTime")
                        })

                    for lab in lab_schedules:
                        day = lab.get("day", "").upper()
                        start_bd_str = convert_to_bd_time(lab.get("startTime"))
                        end_bd_str = convert_to_bd_time(lab.get("endTime"))
                        start = time_to_minutes(start_bd_str)
                        end = time_to_minutes(end_bd_str)
                        formatted_time = convert_time_24_to_12(f"{start_bd_str} - {end_bd_str}")

                        section_schedules.append({
                            "type": "lab",
                            "day": day,
                            "start": start,
                            "end": end,
                            "schedule": lab,
                            "formattedTime": formatted_time
                        })

                    original_section["formattedSchedules"] = section_schedules
                    if "labSchedules" not in original_section or not isinstance(original_section["labSchedules"], list):
                        original_section["labSchedules"] = []

                    final_routine_sections_ai.append(original_section)

            return jsonify({"routine": final_routine_sections_ai, "feedback": feedback}), 200

        except Exception as e:
            print(f"Gemini API error during routine generation: {e}")
            return jsonify({"error": "An error occurred during AI routine generation. Please try again.", "feedback": feedback}), 500

    else:
        # Simple routine generation logic (greedy approach)
        final_routine_sections = []
        occupied_slots = {}
        occupied_exam_slots = []

        # Iterate through each course the user wants in the routine
        for pair in course_faculty_pairs:
            course_code = pair.get("course")
            candidate_sections = candidates_per_course.get(course_code, [])

            selected_section = None

            # Try to find a compatible section for this course
            for section in candidate_sections:
                is_compatible = True
                section_slots = []
                section_exam_slots = []

                # Add mid-term exam if it exists
                if section.get("midExamDate") and section.get("midExamStartTime") and section.get("midExamEndTime"):
                    section_exam_slots.append({
                        "examDate": section["midExamDate"],
                        "startTime": section["midExamStartTime"],
                        "endTime": section["midExamEndTime"],
                        "type": "Mid"
                    })

                # Add final exam if it exists
                if section.get("finalExamDate") and section.get("finalExamStartTime") and section.get("finalExamEndTime"):
                    section_exam_slots.append({
                        "examDate": section["finalExamDate"],
                        "startTime": section["finalExamStartTime"],
                        "endTime": section["finalExamEndTime"],
                        "type": "Final"
                    })

                # Check for conflicts with already selected sections (class/lab time overlaps)
                all_schedules = section.get("formattedSchedules", [])
                for sched_entry in all_schedules:
                    day = sched_entry.get("day", "").upper()
                    start = sched_entry.get("start")
                    end = sched_entry.get("end")

                    if day in occupied_slots:
                        for occupied_start, occupied_end in occupied_slots[day]:
                            if schedules_overlap(start, end, occupied_start, occupied_end):
                                is_compatible = False
                                break
                    if not is_compatible: break

                    section_slots.append((day, start, end))

                # Check for conflicts with already selected sections (exam date overlaps)
                if is_compatible:
                    for exam1 in section_exam_slots:
                        for exam2 in occupied_exam_slots:
                            if exam_schedules_overlap(exam1, exam2):
                                is_compatible = False
                                print(f"Exam conflict found: Section {section.get('courseCode')} {section.get('sectionName')} {exam1['type']} exam on {exam1.get('examDate')} conflicts with a previously selected {exam2['type']} exam on {exam2.get('examDate')}.")
                                break
                        if not is_compatible: break

                if is_compatible:
                    selected_section = section
                    # Add this section's slots to occupied slots
                    for day, start, end in section_slots:
                        if day not in occupied_slots: occupied_slots[day] = []
                        occupied_slots[day].append((start, end))
                    # Add this section's exam slots to occupied exam slots
                    occupied_exam_slots.extend(section_exam_slots)
                    break

            if selected_section:
                final_routine_sections.append(selected_section)
            else:
                return jsonify({"error": f"No compatible section found for {course_code} with the selected options."}), 200

        # If we made it through all courses, return the routine
        if not final_routine_sections:
            return jsonify({"error": "No routine could be generated with the selected options."}), 200

        # Perform a final exam conflict check on the generated routine (non-AI)
        exam_conflicts = []
        for i in range(len(final_routine_sections)):
            section1 = final_routine_sections[i];
            for j in range(i + 1, len(final_routine_sections)):
                section2 = final_routine_sections[j];
                conflicts = check_exam_conflicts(section1, section2)
                exam_conflicts.extend(conflicts)

        if exam_conflicts:
            error_message = "Cannot generate routine due to exam conflicts:\n\n"
            for conflict in exam_conflicts:
                error_message += f"- {conflict['course1']} ({conflict['type1']}) and {conflict['course2']} ({conflict['type2']}) have exams on {conflict['date']}:\n"
                error_message += f"  {conflict['course1']}: {conflict['time1']}\n"
                error_message += f"  {conflict['course2']}: {conflict['time2']}\n\n"
            error_message += "Please select different sections to avoid exam conflicts."
            # Explicitly return error here if conflicts are found
            return jsonify({"error": error_message}), 200

        # If no conflicts found, return the routine
        return jsonify({"routine": final_routine_sections})

def auto_fix_json(s):
    # Count open/close braces and brackets
    open_braces = s.count('{')
    close_braces = s.count('}')
    open_brackets = s.count('[')
    close_brackets = s.count(']')
    # Add missing closing braces/brackets
    s += '}' * (open_braces - close_braces)
    s += ']' * (open_brackets - close_brackets)
    return s

def format24(time_str):
    # Converts "8:00 AM" to "08:00:00"
    try:
        dt = datetime.strptime(time_str.strip(), "%I:%M %p")
        return dt.strftime("%H:%M:%S")
    except Exception:
        return time_str

def timeToMinutes(tstr):
    # Accepts "08:00:00" or "8:00 AM"
    tstr = tstr.strip()
    try:
        if "AM" in tstr or "PM" in tstr:
            dt = datetime.strptime(tstr, "%I:%M %p")
        else:
            dt = datetime.strptime(tstr, "%H:%M:%S")
        return dt.hour * 60 + dt.minute
    except Exception:
        return 0

@app.route("/api/ask_ai", methods=["POST"])
def ask_ai():
    req = request.json
    question = req.get("question", "")
    routine_context = req.get("routine", None)

    if not question:
        return jsonify({"answer": "Please provide a question."}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-001')
        
        # Create a context-aware prompt
        prompt = (
            "You are an AI assistant specifically for the USIS Routine Generator. "
            "Your role is to help students with their course schedules and academic planning. "
            "You should ONLY answer questions related to course scheduling, routine generation, "
            "and academic matters within this application.\n\n"
        )

        # If routine context is provided, add it to the prompt
        if routine_context:
            prompt += (
                "The student has generated the following routine:\n"
                f"{json.dumps(routine_context, indent=2)}\n\n"
                "When answering questions, refer to this routine if relevant.\n\n"
            )

        prompt += (
            "Question: " + question + "\n\n"
            "Instructions:\n"
            "1. Only answer questions related to course scheduling and academic planning\n"
            "2. If the question is about the current routine, provide specific feedback\n"
            "3. If the question is unrelated to the application, politely redirect to course scheduling topics\n"
            "4. Keep answers concise and focused on practical scheduling advice\n"
            "5. Format your response in clear, readable markdown\n"
        )

        response = model.generate_content(prompt)
        answer = response.text.strip()
        return jsonify({"answer": answer}), 200
    except Exception as e:
        print(f"Gemini API error during AI question answering: {e}")
        return jsonify({"answer": "Sorry, I couldn't retrieve an answer at the moment. Please try again later.", "error": str(e)}), 500

@app.route("/api/get_routine_feedback_ai", methods=["POST"])
def get_routine_feedback_ai():
    try:
        data = request.get_json()
        routine = data.get("routine", [])
        
        if not routine:
            return jsonify({"error": "No routine provided for analysis"}), 400

        prompt = (
            f"Look at this routine:\n{json.dumps(routine)}\n\n"
            "First, rate this routine out of 10.\n"
            "Then give me 2-3 quick points about:\n"
            "• How's your schedule looking?\n"
            "• What's good and what needs work?\n"
            "Keep it casual and under 10 words per point.\n"
            "Start with 'Score: X/10'"
        )

        model = genai.GenerativeModel('gemini-1.5-flash-001')
        response = model.generate_content(prompt)
        feedback = response.text.strip()
        
        return jsonify({"feedback": feedback}), 200
    except Exception as e:
        print(f"Error in get_routine_feedback_ai: {e}")
        return jsonify({"error": "Failed to analyze routine"}), 500

@app.route("/api/check_exam_conflicts_ai", methods=["POST"])
def check_exam_conflicts_ai():
    try:
        data = request.get_json()
        routine = data.get("routine", [])
        
        if not routine:
            return jsonify({"error": "No routine provided for analysis"}), 400

        # Helper: Generate markdown table of exam dates
        def exam_dates_table(routine):
            header = "| Course | Midterm Date | Final Date |\n|--------|--------------|------------|\n"
            rows = []
            for section in routine:
                course = section.get("courseCode", "")
                mid = section.get("midExamDate", "N/A")
                final = section.get("finalExamDate", "N/A")
                rows.append(f"| {course} | {mid} | {final} |\n")
            return header + "".join(rows)

        exam_table = exam_dates_table(routine)

        # First check for conflicts using the existing function
        exam_conflicts = []
        for i in range(len(routine)):
            section1 = routine[i]
            for j in range(i + 1, len(routine)):
                section2 = routine[j]
                conflicts = check_exam_conflicts(section1, section2)
                exam_conflicts.extend(conflicts)

        if not exam_conflicts:
            # No conflicts: ask the AI to summarize the exam schedule, not to look for conflicts
            prompt = (
                f"Here is a university routine's exam schedule (see table below):\n\n"
                f"{exam_table}\n\n"
                f"Full routine data:\n{json.dumps(routine)}\n\n"
                "Summarize the exam schedule in 2-3 bullet points.\n"
                "Mention any busy weeks or tight schedules, but do NOT mention any conflicts.\n"
                "Keep it casual and under 10 words per point.\n"
                "Start with 'Score: 10/10' if there are no conflicts."
            )

            model = genai.GenerativeModel('gemini-1.5-flash-001')
            response = model.generate_content(prompt)
            analysis = response.text.strip()
            
            return jsonify({
                "has_conflicts": False,
                "analysis": analysis
            }), 200
        else:
            # Format the conflicts for the AI to analyze
            conflicts_text = "\n".join([
                f"- {conflict['course1']} ({conflict['type1']}) and {conflict['course2']} ({conflict['type2']}) "
                f"have exams on {conflict['date']}:\n"
                f"  {conflict['course1']}: {conflict['time1']}\n"
                f"  {conflict['course2']}: {conflict['time2']}"
                for conflict in exam_conflicts
            ])

            prompt = (
                f"Here is a table of all exam dates for your routine:\n\n"
                f"{exam_table}\n\n"
                f"Here are your exam conflicts:\n{conflicts_text}\n\n"
                "First, rate how bad these conflicts are out of 10 (10 being worst).\n"
                "Then give me 2-3 quick points:\n"
                "• How bad is it?\n"
                "• What can you do?\n"
                "Keep it casual and under 10 words per point.\n"
                "Start with 'Score: X/10'"
            )

            model = genai.GenerativeModel('gemini-1.5-flash-001')
            response = model.generate_content(prompt)
            analysis = response.text.strip()
            
            return jsonify({
                "has_conflicts": True,
                "conflicts": exam_conflicts,
                "analysis": analysis
            }), 200

    except Exception as e:
        print(f"Error in check_exam_conflicts_ai: {e}")
        return jsonify({"error": "Failed to analyze exam conflicts"}), 500

@app.route("/api/check_time_conflicts_ai", methods=["POST"])
def check_time_conflicts_ai():
    try:
        data = request.get_json()
        routine = data.get("routine", [])
        
        if not routine:
            return jsonify({"error": "No routine provided for analysis"}), 400

        # Check for time conflicts
        time_conflicts = []
        for i in range(len(routine)):
            section1 = routine[i]
            for j in range(i + 1, len(routine)):
                section2 = routine[j]
                
                # Check class schedules
                for sched1 in section1.get("sectionSchedule", {}).get("classSchedules", []):
                    for sched2 in section2.get("sectionSchedule", {}).get("classSchedules", []):
                        if sched1.get("day") == sched2.get("day"):
                            start1 = time_to_minutes(sched1.get("startTime"))
                            end1 = time_to_minutes(sched1.get("endTime"))
                            start2 = time_to_minutes(sched2.get("startTime"))
                            end2 = time_to_minutes(sched2.get("endTime"))
                            
                            if schedules_overlap(start1, end1, start2, end2):
                                time_conflicts.append({
                                    "type": "class-class",
                                    "course1": section1.get("courseCode"),
                                    "course2": section2.get("courseCode"),
                                    "day": sched1.get("day"),
                                    "time1": f"{sched1.get('startTime')} - {sched1.get('endTime')}",
                                    "time2": f"{sched2.get('startTime')} - {sched2.get('endTime')}"
                                })

                # Check lab schedules
                for lab1 in section1.get("labSchedules", []):
                    for lab2 in section2.get("labSchedules", []):
                        if lab1.get("day") == lab2.get("day"):
                            start1 = time_to_minutes(lab1.get("startTime"))
                            end1 = time_to_minutes(lab1.get("endTime"))
                            start2 = time_to_minutes(lab2.get("startTime"))
                            end2 = time_to_minutes(lab2.get("endTime"))
                            
                            if schedules_overlap(start1, end1, start2, end2):
                                time_conflicts.append({
                                    "type": "lab-lab",
                                    "course1": section1.get("courseCode"),
                                    "course2": section2.get("courseCode"),
                                    "day": lab1.get("day"),
                                    "time1": f"{lab1.get('startTime')} - {lab1.get('endTime')}",
                                    "time2": f"{lab2.get('startTime')} - {lab2.get('endTime')}"
                                })

        if not time_conflicts:
            prompt = (
                f"Check this routine for time conflicts:\n{json.dumps(routine)}\n\n"
                "First, rate the time schedule out of 10.\n"
                "Then tell me in 2-3 points:\n"
                "• Any class/lab overlaps?\n"
                "• Any gaps in your schedule?\n"
                "Keep it casual and under 10 words per point.\n"
                "Start with 'Score: X/10'"
            )

            model = genai.GenerativeModel('gemini-1.5-flash-001')
            response = model.generate_content(prompt)
            analysis = response.text.strip()
            
            return jsonify({
                "has_conflicts": False,
                "analysis": analysis
            }), 200
        else:
            # Format the conflicts for the AI to analyze
            conflicts_text = "\n".join([
                f"- {conflict['type']} conflict between {conflict['course1']} and {conflict['course2']} "
                f"on {conflict['day']}:\n"
                f"  {conflict['course1']}: {conflict['time1']}\n"
                f"  {conflict['course2']}: {conflict['time2']}"
                for conflict in time_conflicts
            ])

            prompt = (
                f"Here are your time conflicts:\n{conflicts_text}\n\n"
                "First, rate how bad these conflicts are out of 10 (10 being worst).\n"
                "Then give me 2-3 quick points:\n"
                "• How bad is it?\n"
                "• What can you do?\n"
                "Keep it casual and under 10 words per point.\n"
                "Start with 'Score: X/10'"
            )

            model = genai.GenerativeModel('gemini-1.5-flash-001')
            response = model.generate_content(prompt)
            analysis = response.text.strip()
            
            return jsonify({
                "has_conflicts": True,
                "conflicts": time_conflicts,
                "analysis": analysis
            }), 200

    except Exception as e:
        print(f"Error in check_time_conflicts_ai: {e}")
        return jsonify({"error": "Failed to analyze time conflicts"}), 500

@app.route("/api/exam_schedule")
def get_exam_schedule():
    course_code = request.args.get("courseCode")
    section_name = request.args.get("sectionName")
    if not course_code or not section_name:
        return jsonify({"error": "Missing courseCode or sectionName"}), 400

    # Find the section in the data
    for section in data:
        if (section.get("courseCode") == course_code and
            str(section.get("sectionName")) == str(section_name)):
            # Return only the exam fields
            return jsonify({
                "courseCode": section.get("courseCode"),
                "sectionName": section.get("sectionName"),
                "midExamDate": section.get("midExamDate"),
                "midExamStartTime": section.get("midExamStartTime"),
                "midExamEndTime": section.get("midExamEndTime"),
                "finalExamDate": section.get("finalExamDate"),
                "finalExamStartTime": section.get("finalExamStartTime"),
                "finalExamEndTime": section.get("finalExamEndTime"),
            })
    return jsonify({"error": "Section not found"}), 404

if __name__ == "__main__":
    # Make sure you configure Gemini API key here or via environment variable
    try:
       import google.generativeai as genai
       # It's recommended to use environment variables for API keys
       # genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
       # Or if hardcoding for testing (less secure)
       genai.configure(api_key="AIzaSyBbRr2CP8k7YK5qJ4eSmb0AEVpN6sqxUOk") # <-- Replace with your actual key or env var
       print("Gemini API configured.")
    except Exception as e:
       print(f"Failed to configure Gemini API: {e}")

    app.run(debug=True)
