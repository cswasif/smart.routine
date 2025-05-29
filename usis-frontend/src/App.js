import React, { useEffect, useState } from "react";
import axios from "axios";
import Select from "react-select";
import './App.css';
import { format } from 'date-fns';

const API_BASE = "http://localhost:5000/api";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"];
const TIME_SLOTS = [
  { value: "8:00 AM-9:20 AM", label: "8:00 AM-9:20 AM (BD Time)" },
  { value: "9:30 AM-10:50 AM", label: "9:30 AM-10:50 AM (BD Time)" },
  { value: "11:00 AM-12:20 PM", label: "11:00 AM-12:20 PM (BD Time)" },
  { value: "12:30 PM-1:50 PM", label: "12:30 PM-1:50 PM (BD Time)" },
  { value: "2:00 PM-3:20 PM", label: "2:00 PM-3:20 PM (BD Time)" },
  { value: "3:30 PM-4:50 PM", label: "3:30 PM-4:50 PM (BD Time)" },
  { value: "5:00 PM-6:20 PM", label: "5:00 PM-6:20 PM (BD Time)" }
];

// Helper: format 24-hour time string to 12-hour AM/PM
const formatTime12Hour = (timeString) => {
    if (!timeString) return 'N/A';
    try {
        const [hours, minutes] = timeString.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
    return format(date, 'h:mm aa');
    } catch (error) {
    return timeString;
    }
};

// Helper to extract tables from markdown string
function extractTables(markdown) {
  const tables = [];
  const regex = /((?:\\|.*\\|.*\\n)+)/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    if (match[1].includes('|')) tables.push(match[1].trim());
  }
  return tables;
}

// Helper to parse a markdown table into rows/columns
function parseMarkdownTable(table) {
  const lines = table.split('\n').filter(line => line.trim().length > 0);
  const header = lines[0].split('|').map(cell => cell.trim()).filter(Boolean);
  const rows = lines.slice(2).map(line =>
    line.split('|').map(cell => cell.trim()).filter(Boolean)
  );
  return { header, rows };
}

function renderRoutineGrid(sections, selectedDays) {
  console.log("Rendering routine grid...");
  console.log("Sections received:", sections);
  // Use all days for rendering columns, not just filtered days
  // const filteredDays = DAYS.filter(day => selectedDays.includes(day));
  
  // Build a lookup: { [day]: { [timeSlotValue]: [entries, ...] } }
  const grid = {};
  for (const day of DAYS) { // Use all DAYS here
    grid[day] = {};
    for (const slot of TIME_SLOTS.map(s => s.value)) {
      grid[day][slot] = [];
    }
  }

  console.log("Iterating through sections for grid population:", sections);
  sections.forEach(section => {
    const schedules = section.formattedSchedules || [];
    console.log(`Processing section ${section.courseCode} - ${section.sectionName}, schedules:`, schedules);
    schedules.forEach(schedEntry => {
      console.log("Processing schedule entry:", schedEntry);
      const day = schedEntry.day.charAt(0).toUpperCase() + schedEntry.day.slice(1).toLowerCase();

      // Use start and end times in minutes from the backend's formattedSchedules if available, otherwise calculate
      const schedStartMinutes = schedEntry.start !== undefined ? schedEntry.start : timeToMinutes(schedEntry.schedule.startTime);
      const schedEndMinutes = schedEntry.end !== undefined ? schedEntry.end : timeToMinutes(schedEntry.schedule.endTime);

      TIME_SLOTS.forEach(slot => {
        const [slotStartStr, slotEndStr] = slot.value.split('-');
        const slotStartMinutes = timeToMinutes(slotStartStr);
        const slotEndMinutes = timeToMinutes(slotEndStr);

        console.log(`Comparing schedule Day: ${day}, Time: ${schedStartMinutes}-${schedEndMinutes} with Slot Day: ${day}, Time: ${slotStartMinutes}-${slotEndMinutes}`); // Debug print

        // Check if the schedule time range overlaps with the current time slot AND the day is included in the full DAYS list
        if (selectedDays.includes(day) && grid[day] && schedules_overlap(schedStartMinutes, schedEndMinutes, slotStartMinutes, slotEndMinutes)) { // Check against selectedDays here
          // Push the necessary data to render in the grid cell
          console.log(`Overlap found! Pushing schedule to grid: Day=${day}, Slot=${slot.value}, Type=${schedEntry.type}`);
          grid[day][slot.value].push({
            type: schedEntry.type,
            section: section,
            formattedTime: schedEntry.formattedTime,
            day: schedEntry.day
        });
      }
    });
    });
  });

  return (
    <table className="routine-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
      <thead>
        <tr>
          <th>Time/Day</th>
          {DAYS.map(day => <th key={day}>{day}</th>)} {/* Use all DAYS here */}
        </tr>
      </thead>
      <tbody>
        {TIME_SLOTS.map(slot => (
          <tr key={slot.value}>
            <td><b>{slot.label}</b></td>
            {DAYS.map(day => ( /* Use all DAYS here */
              <td key={day}>
                {grid[day] && grid[day][slot.value] && grid[day][slot.value].length > 0 ? ( // Check if grid[day] and grid[day][slot.value] exist
                  grid[day][slot.value].map((entry, idx) => (
                    <div key={idx} style={{
                      marginBottom: 4,
                      padding: '4px',
                      backgroundColor: entry.type === 'lab' ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: '4px'
                    }}>
                      {/* Use the data from the grid entry */}
                      {entry.type === "class" && (
                        <span>
                          <b>Class:</b> {entry.section.courseCode}
                      {entry.section.sectionName && ` - ${entry.section.sectionName}`}
                          {entry.section.faculties && ` - ${typeof entry.section.faculties === 'string' ? entry.section.faculties : 'TBA'}`}
                          {entry.section.roomName && ` - ${entry.section.roomName}`}
                          {/* Display time and day from formattedSchedules */}
                           <div style={{ color: "#555", marginTop: "4px" }}>
                            {entry.formattedTime}
                            <br />
                            {entry.day}
                    </div>
                        </span>
                      )}
                      {entry.type === "lab" && (
                        <span>
                          <b>Lab:</b> {entry.section.courseCode}
                          {entry.section.sectionName && ` - ${entry.section.sectionName}`}
                          {entry.section.faculties && ` - ${typeof entry.section.faculties === 'string' ? entry.section.faculties : 'TBA'}`}
                          {entry.section.labRoomName && ` - ${entry.section.labRoomName}`}
                           {/* Display time and day from formattedSchedules */}
                          <div style={{ color: "#007bff", marginTop: "4px" }}>
                            {entry.formattedTime}
                            <br />
                            {entry.day}
                          </div>
                        </span>
                      )}
                    </div>
                  ))
                ) : null} {/* Added null for empty cells */}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Helper to convert time string to minutes
function timeToMinutes(tstr) {
  tstr = tstr.trim();
  try {
    if (tstr.includes('AM') || tstr.includes('PM')) {
      const [time, period] = tstr.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + m;
    } else if (tstr.includes(':')) {
        const [h, m, s] = tstr.split(':').map(Number);
        return h * 60 + m; // Ignore seconds for now
    } else {
        return 0;
    }
  } catch(e) {
    console.error("Error in timeToMinutes:", tstr, e);
    return 0;
  }
}

// Helper to check if two time ranges overlap (in minutes)
function schedules_overlap(start1, end1, start2, end2) {
    return Math.max(start1, start2) < Math.min(end1, end2);
}

// Helper to convert slot label to 24-hour time string
function format24(timeStr) {
  // Converts "8:00 AM" to "08:00:00"
  try {
    const date = new Date(`1970-01-01T${timeStr.trim().replace(' ', '')}`);
    return date.toTimeString().slice(0,8);
  } catch {
    return timeStr;
  }
}

// New Component: SeatStatusPage
const SeatStatusPage = ({ courses }) => {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);

  // Fetch course details when a course is selected
  useEffect(() => {
    if (selectedCourse) {
      setIsLoadingSections(true);
      axios.get(`${API_BASE}/course_details?course=${selectedCourse.value}`)
        .then(res => setSections(res.data))
        .catch(error => {
          console.error("Error fetching sections:", error);
          setSections([]); // Clear sections on error
        })
        .finally(() => setIsLoadingSections(false));
    } else {
      setSections([]);
      setIsLoadingSections(false);
    }
  }, [selectedCourse]);

  const sortedSections = sections.slice().sort((a, b) => {
    const nameA = a.sectionName || '';
    const nameB = b.sectionName || '';
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* Course Selector */}
      <div style={{ 
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Select
          options={courses.map(c => ({ value: c.code, label: c.code }))}
          value={selectedCourse}
          onChange={setSelectedCourse}
          placeholder="Search and select a course..."
          isClearable={true}
          isSearchable={true}
          styles={{
            control: (provided, state) => ({
              ...provided,
              minWidth: '300px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              boxShadow: state.isFocused ? '0 0 0 2px rgba(0, 123, 255, 0.1)' : 'none',
              '&:hover': {
                borderColor: '#80bdff'
              }
            }),
            option: (provided, state) => ({
              ...provided,
              backgroundColor: state.isSelected ? '#007bff' : state.isFocused ? '#f8f9fa' : 'white',
              color: state.isSelected ? 'white' : '#212529',
              cursor: 'pointer',
              padding: '8px 12px'
            })
          }}
        />
      </div>

      {/* Loading State */}
      {isLoadingSections && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading sections...</span>
          </div>
        </div>
      )}

      {/* No Course Selected */}
      {!selectedCourse && !isLoadingSections && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: '#6c757d',
          fontSize: '1.1em'
        }}>
          Please select a course to view seat status
        </div>
      )}

      {/* No Sections Found */}
      {selectedCourse && !isLoadingSections && sections.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: '#6c757d',
          fontSize: '1.1em'
        }}>
          No sections found with available seats for {selectedCourse.label}
        </div>
      )}

      {/* Sections Table */}
      {selectedCourse && sections.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e0e0e0',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.2em', color: '#212529' }}>
              Sections for {selectedCourse.label}
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.95em'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#495057' }}>Section</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#495057' }}>Faculty</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#495057' }}>Seats</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#495057' }}>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {sortedSections.map(section => (
                  <tr key={section.sectionId} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '500' }}>{section.sectionName}</div>
                      <div style={{ fontSize: '0.9em', color: '#6c757d' }}>{section.courseCode}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {section.faculties || 'TBA'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ 
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: section.availableSeats > 10 ? '#d4edda' : 
                                       section.availableSeats > 0 ? '#fff3cd' : '#f8d7da',
                        color: section.availableSeats > 10 ? '#155724' :
                               section.availableSeats > 0 ? '#856404' : '#721c24'
                      }}>
                        {section.availableSeats} / {section.capacity}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {/* Class Schedule */}
                      {(section.sectionSchedule?.classSchedules || []).map((schedule, index) => (
                        <div key={index} style={{ marginBottom: '4px' }}>
                          <span style={{ 
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#e9ecef',
                            fontSize: '0.9em',
                            marginRight: '8px'
                          }}>
                            {schedule.day}
                          </span>
                          <span style={{ color: '#495057' }}>
                            {formatTime12Hour(schedule.startTime)} - {formatTime12Hour(schedule.endTime)}
                          </span>
                          {schedule.room && (
                            <span style={{ color: '#6c757d', marginLeft: '8px' }}>
                              ({schedule.room})
                            </span>
                          )}
                        </div>
                      ))}
                      {/* Lab Schedule */}
                      {(section.labSchedules || []).map((schedule, index) => (
                        <div key={index} style={{ marginBottom: '4px' }}>
                          <span style={{ 
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#cce5ff',
                            fontSize: '0.9em',
                            marginRight: '8px'
                          }}>
                            Lab: {schedule.day}
                          </span>
                          <span style={{ color: '#495057' }}>
                            {formatTime12Hour(schedule.startTime)} - {formatTime12Hour(schedule.endTime)}
                          </span>
                          {schedule.room && (
                            <span style={{ color: '#6c757d', marginLeft: '8px' }}>
                              ({schedule.room})
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [sections, setSections] = useState([]);
  const [showRoutinePage, setShowRoutinePage] = useState(false);
  const [routineCourses, setRoutineCourses] = useState([]);
  const [routineFaculty, setRoutineFaculty] = useState(null);
  const [routineDays, setRoutineDays] = useState([]);
  const [routineFacultyOptions, setRoutineFacultyOptions] = useState([]);
  const [routineResult, setRoutineResult] = useState(null);
  const [routinePageUrl, setRoutinePageUrl] = useState('');
  const [showMakeRoutinePage, setShowMakeRoutinePage] = useState(false);
  const [selectedCourseFaculty, setSelectedCourseFaculty] = useState({});
  const [availableFacultyByCourse, setAvailableFacultyByCourse] = useState({});
  const [selectedFacultyByCourse, setSelectedFacultyByCourse] = useState({});
  const [routineTimes, setRoutineTimes] = useState([]);
  const [routineError, setRoutineError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rawRoutineResult, setRawRoutineResult] = useState(null);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [commutePreference, setCommutePreference] = useState("");

  // Fetch all courses on mount
  useEffect(() => {
    axios.get(`${API_BASE}/courses`).then(res => setCourses(res.data));
  }, []);

  // Fetch course details when a course is selected
  useEffect(() => {
    if (selectedCourse) {
      axios.get(`${API_BASE}/course_details?course=${selectedCourse.value}`)
        .then(res => setSections(res.data));
    } else {
      setSections([]);
    }
  }, [selectedCourse]);

  // Fetch faculty options when routine page is shown
  useEffect(() => {
    if (showRoutinePage && selectedCourse) {
      axios.get(`${API_BASE}/course_details?course=${selectedCourse.value}`)
          .then(res => {
            const faculties = res.data.map(section => section.faculties).filter(Boolean);
            setRoutineFacultyOptions([...new Set(faculties)]);
          });
    }
  }, [showRoutinePage, selectedCourse]);

  useEffect(() => {
    if (routineCourses.length > 0) {
      const fetchFaculties = async () => {
        const allFaculties = new Set();
        for (const course of routineCourses) {
          try {
            const res = await axios.get(`${API_BASE}/course_details?course=${course.value}`);
            const faculties = res.data.map(section => section.faculties).filter(Boolean);
            faculties.forEach(f => allFaculties.add(f));
          } catch (error) {}
        }
        setRoutineFacultyOptions([...allFaculties]);
      };
      fetchFaculties();
    }
  }, [routineCourses]);

  useEffect(() => {
    if (showRoutinePage) {
      const coursesParam = routineCourses.map(c => c.value).join(',');
      const facultyParam = routineFaculty ? routineFaculty.value : '';
      const daysParam = routineDays.map(d => d.value).join(',');
      setRoutinePageUrl(`/routine?courses=${coursesParam}&faculty=${facultyParam}&days=${daysParam}`);
    }
  }, [showRoutinePage, routineCourses, routineFaculty, routineDays]);

  const sortedSections = sections.slice().sort((a, b) => {
    const nameA = a.sectionName || '';
    const nameB = b.sectionName || '';
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });

  // --- Routine Page ---
  const RoutinePage = () => {
    const handleGenerateRoutine = () => {
      axios.post(`${API_BASE}/routine`, {
        courses: routineCourses.map(c => c.value),
        faculty: routineFaculty ? routineFaculty.value : null,
        days: routineDays.map(d => d.value)
      }).then(res => setRoutineResult(res.data.routine));
    };
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const coursesParam = params.get('courses');
      const facultyParam = params.get('faculty');
      const daysParam = params.get('days');
      if (coursesParam) setRoutineCourses(coursesParam.split(',').map(c => ({ value: c, label: c })));
      if (facultyParam) setRoutineFaculty({ value: facultyParam, label: facultyParam });
      if (daysParam) setRoutineDays(daysParam.split(',').map(d => ({ value: d, label: d })));
    }, []);
    // --- Render ---
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Routine Page</h2>
        <p>Select courses, faculty, and days to generate a routine.</p>
        <div style={{ marginBottom: "20px" }}>
          <label>Courses:</label>
          <Select
            isMulti
            options={courses.map(c => ({ value: c.code, label: c.code }))}
            value={routineCourses}
            onChange={setRoutineCourses}
            placeholder="Select courses..."
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label>Faculty:</label>
          <Select
            options={routineFacultyOptions.map(f => ({ value: f, label: f }))}
            value={routineFaculty}
            onChange={setRoutineFaculty}
            placeholder="Select faculty..."
          />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label>Days:</label>
          <Select
            isMulti
            options={DAYS.map(d => ({ value: d, label: d }))}
            value={routineDays}
            onChange={setRoutineDays}
            placeholder="Select days..."
          />
        </div>
        <button onClick={handleGenerateRoutine}>Generate Routine</button>
        {/* Summary of selections - always render strings only */}
        <div style={{ marginBottom: "20px", color: "#555" }}>
          <div>
            <b>Selected Courses:</b> {Array.isArray(routineCourses) && routineCourses.length ? routineCourses.map(c => (typeof c === 'object' ? (c.label || c.value || '') : String(c))).join(', ') : "None"}
          </div>
          <div>
            <b>Selected Faculty:</b> {routineFaculty && typeof routineFaculty === 'object' ? (routineFaculty.label || routineFaculty.value || '') : (routineFaculty || "None")}
          </div>
          <div>
            <b>Selected Days:</b> {Array.isArray(routineDays) && routineDays.length ? routineDays.map(d => (typeof d === 'object' ? (d.label || d.value || '') : String(d))).join(', ') : "None"}
          </div>
        </div>
        {routineResult && Array.isArray(routineResult) && (
              <div style={{ marginTop: "20px", padding: "20px", border: "1px solid #ddd", borderRadius: "4px" }}>
                <h3 style={{ textAlign: 'center', marginBottom: 24 }}>Generated Routine:</h3>
            {renderRoutineGrid(routineResult, routineDays.map(d => d.value))}
          </div>
        )}
        <button onClick={() => window.close()}>Back</button>
      </div>
    );
  };

  // --- Make Routine Page ---
  const MakeRoutinePage = () => {
    const handleCourseSelect = async (selectedOptions) => {
      setRoutineCourses(selectedOptions);
      for (const course of selectedOptions) {
        try {
          const res = await axios.get(`${API_BASE}/course_details?course=${course.value}`);
          const facultySections = {};
          res.data.forEach(section => {
            if (section.faculties) {
              const availableSeats = section.capacity - section.consumedSeat;
              if (availableSeats > 0) {
                if (!facultySections[section.faculties]) {
                  facultySections[section.faculties] = {
                    sections: [],
                    totalSeats: 0,
                    availableSeats: 0
                  };
                }
                facultySections[section.faculties].sections.push(section);
                facultySections[section.faculties].totalSeats += section.capacity;
                facultySections[section.faculties].availableSeats += availableSeats;
              }
            }
          });
          setAvailableFacultyByCourse(prev => ({ ...prev, [course.value]: facultySections }));
        } catch (error) {}
      }
      // Remove faculty data for unselected courses
      const selectedCourseCodes = selectedOptions.map(c => c.value);
      setAvailableFacultyByCourse(prev => {
        const newState = {};
        selectedCourseCodes.forEach(code => { if (prev[code]) newState[code] = prev[code]; });
        return newState;
      });
      setSelectedFacultyByCourse(prev => {
        const newState = {};
        selectedCourseCodes.forEach(code => { if (prev[code]) newState[code] = prev[code]; });
        return newState;
      });
    };
    const handleFacultyChange = (courseValue, selected) => {
      setSelectedFacultyByCourse(prev => ({ ...prev, [courseValue]: selected }));
    };
    const handleGenerateRoutine = (useAI) => {
      setRoutineError("");
      setRoutineResult(null);
      setRawRoutineResult(null);
      setAiFeedback(null);

      // Validate that at least two days are selected
      if (routineDays.length < 2) {
        setRoutineError("Please select at least two days. Classes typically require two days per week.");
        return;
      }

      // Get selected days in uppercase for comparison
      const selectedDays = routineDays.map(d => d.value.toUpperCase());

      setIsLoading(true);

      const courseFacultyMap = routineCourses.map(course => ({
        course: course.value,
        faculty: (selectedFacultyByCourse[course.value] || [])
          .filter(f => f && typeof f === 'object')
          .map(f => f.value || '')
      }));

      axios.post(`${API_BASE}/routine`, {
        courses: courseFacultyMap,
        days: selectedDays,
        times: routineTimes.map(t => t.value),
        useAI: useAI,
        commutePreference: commutePreference
      }).then(res => {
        setIsLoading(false); // Move isLoading to be set here on success/failure response
        
        // Check for error response from backend
        if (res.data && res.data.error) {
          setRoutineError(res.data.error);
          setRoutineResult(null); // Clear routine results on error
          setRawRoutineResult(null);
          setAiFeedback(null);
          return;
        }

        let geminiResponse = res.data;

        // Handle potential nested routine structure from backend
        if (geminiResponse && geminiResponse.routine && Array.isArray(geminiResponse.routine)) {
          geminiResponse = geminiResponse.routine;
        } else if (!Array.isArray(geminiResponse)) {
            // If it's not an array and no nested routine, treat as empty or single section result
            geminiResponse = geminiResponse ? [geminiResponse] : [];
        }

        // Ensure geminiResponse is an array before proceeding
        if (!Array.isArray(geminiResponse)) {
             console.error("Unexpected response format from backend:", res.data);
             setRoutineError('Failed to process routine response from backend.');
          setRoutineResult(null);
             setRawRoutineResult(null);
             setAiFeedback(null);
             return;
        }

        // The backend is now responsible for checking exam conflicts before returning
        // If we reach here, the backend did not return an error, so we assume no conflicts.
        
        // Optional: Re-check exam conflicts on the frontend for double validation (can be removed if backend is trusted)
        // const examConflicts = [];
        // for (let i = 0; i < geminiResponse.length; i++) {
        //   const section1 = geminiResponse[i];
        //   for (let j = i + 1; j < geminiResponse.length; j++) {
        //     const section2 = geminiResponse[j];
        //     // Check mid-term exam conflicts
        //     if (section1.midExamDate && section1.midExamStartTime && section1.midExamEndTime &&
        //         section2.midExamDate && section2.midExamStartTime && section2.midExamEndTime) {
        //       if (section1.midExamDate === section2.midExamDate) {
        //         const start1 = timeToMinutes(section1.midExamStartTime);
        //         const end1 = timeToMinutes(section1.midExamEndTime);
        //         const start2 = timeToMinutes(section2.midExamStartTime);
        //         const end2 = timeToMinutes(section2.midExamEndTime);
        //
        //         if (schedules_overlap(start1, end1, start2, end2)) {
        //           examConflicts.push({
        //             course1: section1.courseCode,
        //             course2: section2.courseCode,
        //             date: section1.midExamDate,
        //             type1: "Mid",
        //             type2: "Mid",
        //             time1: `${section1.midExamStartTime} - ${section1.midExamEndTime}`,
        //             time2: `${section2.midExamStartTime} - ${section2.midExamEndTime}`
        //           });
        //         }
        //       }
        //     }
        //
        //     // Check final exam conflicts
        //     if (section1.finalExamDate && section1.finalExamStartTime && section1.finalExamEndTime &&
        //         section2.finalExamDate && section2.finalExamStartTime && section2.finalExamEndTime) {
        //       if (section1.finalExamDate === section2.finalExamDate) {
        //         const start1 = timeToMinutes(section1.finalExamStartTime);
        //         const end1 = timeToMinutes(section1.finalExamEndTime);
        //         const start2 = timeToMinutes(section2.finalExamStartTime);
        //         const end2 = timeToMinutes(section2.finalExamEndTime);
        //
        //         if (schedules_overlap(start1, end1, start2, end2)) {
        //           examConflicts.push({
        //             course1: section1.courseCode,
        //             course2: section2.courseCode,
        //             date: section1.finalExamDate,
        //             type1: "Final",
        //             type2: "Final",
        //             time1: `${section1.finalExamStartTime} - ${section1.finalExamEndTime}`,
        //             time2: `${section2.finalExamStartTime} - ${section2.finalExamEndTime}`
        //           });
        //         }
        //       }
        //     }
        //
        //     // Check mid-term vs final exam conflicts
        //     if (section1.midExamDate && section1.midExamStartTime && section1.midExamEndTime &&
        //         section2.finalExamDate && section2.finalExamStartTime && section2.finalExamEndTime) {
        //       if (section1.midExamDate === section2.finalExamDate) {
        //         const start1 = timeToMinutes(section1.midExamStartTime);
        //         const end1 = timeToMinutes(section1.midExamEndTime);
        //         const start2 = timeToMinutes(section2.finalExamStartTime);
        //         const end2 = timeToMinutes(section2.finalExamEndTime);
        //
        //         if (schedules_overlap(start1, end1, start2, end2)) {
        //           examConflicts.push({
        //             course1: section1.courseCode,
        //             course2: section2.courseCode,
        //             date: section1.midExamDate,
        //             type1: "Mid",
        //             type2: "Final",
        //             time1: `${section1.midExamStartTime} - ${section1.midExamEndTime}`,
        //             time2: `${section2.finalExamStartTime} - ${section2.finalExamEndTime}`
        //           });
        //         }
        //       }
        //     }
        //
        //     // Check final vs mid-term exam conflicts
        //     if (section1.finalExamDate && section1.finalExamStartTime && section1.finalExamEndTime &&
        //         section2.midExamDate && section2.midExamStartTime && section2.midExamEndTime) {
        //       if (section1.finalExamDate === section2.midExamDate) {
        //         const start1 = timeToMinutes(section1.finalExamStartTime);
        //         const end1 = timeToMinutes(section1.finalExamEndTime);
        //         const start2 = timeToMinutes(section2.midExamStartTime);
        //         const end2 = timeToMinutes(section2.midExamEndTime);
        //
        //         if (schedules_overlap(start1, end1, start2, end2)) {
        //           examConflicts.push({
        //             course1: section1.courseCode,
        //             course2: section2.courseCode,
        //             date: section1.finalExamDate,
        //             type1: "Final",
        //             type2: "Mid",
        //             time1: `${section1.finalExamStartTime} - ${section1.finalExamEndTime}`,
        //             time2: `${section2.midExamStartTime} - ${section2.midExamEndTime}`
        //           });
        //         }
        //       }
        //     }
        //   }
        // }
        //
        // if (examConflicts.length > 0) {
        //   let errorMessage = "Cannot generate routine due to exam conflicts:\n\n";
        //   examConflicts.forEach(conflict => {
        //     errorMessage += `- ${conflict.course1} (${conflict.type1}) and ${conflict.course2} (${conflict.type2}) have exams on ${conflict.date}:\n`;
        //     errorMessage += `  ${conflict.course1}: ${conflict.time1}\n`;
        //     errorMessage += `  ${conflict.course2}: ${conflict.time2}\n\n`;
        //   });
        //   errorMessage += "Please select different sections to avoid exam conflicts.";
        //   setRoutineError(errorMessage);
        //   return;
        // }

        // Continue with existing validation for lab and class days
        const selectedDaysUpper = routineDays.map(d => d.value.toUpperCase());
        let labDayMismatch = false;
        let classDayMismatch = false;
        const mismatchedLabs = [];
        const mismatchedClasses = [];

        geminiResponse.forEach(section => {
          const requiredClassDays = section.sectionSchedule?.classSchedules?.map(s => s.day.toUpperCase()) || [];
          requiredClassDays.forEach(classDayUpper => {
            if (!selectedDaysUpper.includes(classDayUpper)) {
              classDayMismatch = true;
              mismatchedClasses.push(`${section.courseCode} (${classDayUpper})`);
            }
          });

          if (section.labSchedules && section.labSchedules.length > 0) {
            section.labSchedules.forEach(labSched => {
              const labDayUpper = labSched.day.toUpperCase();
              if (!selectedDaysUpper.includes(labDayUpper)) {
                labDayMismatch = true;
                mismatchedLabs.push(`${section.courseCode} Lab (${labSched.day})`);
              }
            });
          }
        });

        if (classDayMismatch || labDayMismatch) {
          let errorMessage = "Cannot generate routine with the selected days:\n\n";
          if (classDayMismatch) {
            errorMessage += `- Missing required class day(s) for: ${mismatchedClasses.join(', ')}\n`;
          }
          if (labDayMismatch) {
            errorMessage += `- Missing required lab day(s) for: ${mismatchedLabs.join(', ')}\n`;
          }
          errorMessage += "\nPlease select the necessary day(s) for all courses.";
          setRoutineError(errorMessage);
          return;
        }

        setRawRoutineResult(res.data);
        setRoutineResult(geminiResponse);
        if (res.data && res.data.feedback) { // Check if res.data exists before accessing feedback
          setAiFeedback(res.data.feedback);
        }
      }).catch(error => {
        console.error("Error generating routine:", error);
          setRoutineError('Failed to generate routine. Please try again.');
      }).finally(() => {
        setIsLoading(false);
        });
    };
    // Custom option component for faculty selection
    const FacultyOption = ({ data, ...props }) => {
      const facultyInfo = availableFacultyByCourse[props.selectProps.name]?.[data.value];
      return (
        <div {...props.innerProps} style={{ padding: '8px' }}>
          <div style={{ fontWeight: 'bold' }}>{data.label}</div>
          {facultyInfo && (
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              Available Seats: {facultyInfo.availableSeats} / {facultyInfo.totalSeats}
            </div>
          )}
        </div>
      );
    };
    // Add loading spinner component
    const LoadingSpinner = () => (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );

    // Update the routine result display with transitions
    const RoutineResult = () => {
      if (isLoading) {
        return <LoadingSpinner />;
      }

      if (routineError) {
        return (
          <div style={{
            color: 'red',
            marginTop: '20px',
            fontWeight: 'bold',
            textAlign: 'center',
            padding: '20px',
            backgroundColor: '#fff3f3',
            borderRadius: '4px',
            border: '1px solid #ffcdd2'
          }}>
            {routineError}
          </div>
        );
      }

      if (routineResult && Array.isArray(routineResult)) {
        return (
          <div style={{
            marginTop: "20px",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            opacity: isLoading ? 0.5 : 1,
            transition: 'opacity 0.3s ease-in-out'
          }}>
            <h3 style={{ textAlign: 'center', marginBottom: 24 }}>Generated Routine:</h3>
            {/* Display Feedback */}
            {aiFeedback && (
              <div style={{
                marginTop: "10px",
                marginBottom: "20px",
                padding: "15px",
                backgroundColor: "#e8f5e9",
                border: "1px solid #c8e6c9",
                borderRadius: "8px",
                textAlign: "left",
                color: "#2e7d32"
              }}>
                <b>Feedback:</b> {aiFeedback}
              </div>
            )}
            {renderRoutineGrid(routineResult, routineDays.map(d => d.value))}
          </div>
        );
      }

      return null;
    };

    // Update the generate button to show loading state
    const GenerateButton = () => (
      <button
        onClick={() => handleGenerateRoutine(false)}
        disabled={routineCourses.length === 0 || routineDays.length === 0 || isLoading}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          backgroundColor: isLoading ? "#cccccc" : "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: 'background-color 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '150px'
        }}
      >
        {isLoading ? (
          <>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              marginRight: '10px',
              animation: 'spin 1s linear infinite'
            }} />
            Generating...
          </>
        ) : (
          'Generate Routine'
        )}
      </button>
    );

    const GenerateAIButton = () => (
      <button
        onClick={() => handleGenerateRoutine(true)}
        disabled={routineCourses.length === 0 || routineDays.length === 0 || isLoading}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          backgroundColor: isLoading ? "#cccccc" : "#17a2b8",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: 'background-color 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '180px',
          marginLeft: '10px'
        }}
      >
        {isLoading ? (
          <>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              marginRight: '10px',
              animation: 'spin 1s linear infinite'
            }} />
            Generating...
          </>
        ) : (
          'Use AI for Best Routine'
        )}
      </button>
    );

    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2>Make Routine</h2>
        <p>Select courses and their faculty, then choose available days and times.</p>
        {/* Course Selection */}
        <div style={{ marginBottom: "20px" }}>
          <label>Courses:</label>
          <Select
            isMulti
            options={courses.map(c => ({ value: c.code, label: c.code }))}
            value={routineCourses}
            onChange={handleCourseSelect}
            placeholder="Select courses..."
          />
        </div>
        {/* Faculty Selection for Each Course */}
        {routineCourses.map(course => {
          const facultyOptions = Object.entries(availableFacultyByCourse[course.value] || {})
            .filter(([_, info]) => info.availableSeats > 0)
            .map(([faculty, info]) => ({ value: faculty, label: faculty, info }));
          const selectedFaculty = selectedFacultyByCourse[course.value] || [];
          return (
            <div key={course.value} style={{ marginBottom: "20px", padding: "10px", border: "1px solid #ddd", borderRadius: "4px" }}>
              <h3 style={{ margin: "0 0 10px 0" }}>{course.label}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ minWidth: "80px" }}>Faculty:</label>
                <Select
                  isMulti
                  name={course.value}
                  options={facultyOptions}
                  value={selectedFaculty}
                  onChange={selected => handleFacultyChange(course.value, selected)}
                  placeholder="Search and select faculty..."
                  isDisabled={!availableFacultyByCourse[course.value] || facultyOptions.length === 0}
                  components={{ Option: FacultyOption }}
                  styles={{
                    option: (provided, state) => ({
                      ...provided,
                      backgroundColor: state.isSelected ? '#4CAF50' : state.isFocused ? '#e6f3e6' : 'white',
                      color: state.isSelected ? 'white' : 'black',
                      cursor: 'pointer'
                    }),
                    menu: (provided) => ({ ...provided, zIndex: 9999 }),
                    control: (provided) => ({ ...provided, minHeight: '38px' })
                  }}
                  noOptionsMessage={() => "No faculty available with seats"}
                  isClearable={true}
                />
                 {/* Display selected faculty labels safely */}
                {selectedFaculty.length > 0 && (
                   <div style={{ fontSize: '0.9em', color: '#666', marginLeft: '10px' }}>
                    Selected: {selectedFaculty.map(f => f && typeof f === 'object' ? (f.label || f.value || '') : String(f)).join(', ')}
                   </div>
                 )}
              </div>
            </div>
          );
        })}
        {/* Days Selection */}
        <div style={{ marginBottom: "20px" }}>
          <label>Available Days:</label>
          <Select
            isMulti
            options={DAYS.map(d => ({ value: d, label: d }))}
            value={routineDays}
            onChange={setRoutineDays}
            placeholder="Select days..."
          />
        </div>
        {/* Time Selection */}
        <div style={{ marginBottom: "20px" }}>
          <label>Available Times:</label>
          <Select
            isMulti
            options={TIME_SLOTS}
            value={routineTimes}
            onChange={setRoutineTimes}
            placeholder="Select available times (Bangladesh Time)..."
          />
        </div>
        {/* Commute Preference Selection */}
        <div style={{ marginBottom: "20px", textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold", color: "#555" }}>Commute Preference:</label>
          <div>
            <label style={{ marginRight: "15px" }}>
              <input
                type="radio"
                value="far"
                checked={commutePreference === "far"}
                onChange={(e) => setCommutePreference(e.target.value)}
                style={{ marginRight: "5px" }}
              />
              Live Far (More classes on same day)
            </label>
            <label>
              <input
                type="radio"
                value="near"
                checked={commutePreference === "near"}
                onChange={(e) => setCommutePreference(e.target.value)}
                style={{ marginRight: "5px" }}
              />
              Live Near (Spread out classes)
            </label>
          </div>
        </div>
        {/* Summary of selections - always render strings only */}
        <div style={{ marginBottom: "20px", color: "#555" }}>
          <div>
            <b>Selected Courses:</b> {Array.isArray(routineCourses) && routineCourses.length ? routineCourses.map(c => (typeof c === 'object' ? (c.label || c.value || '') : String(c))).join(', ') : "None"}
          </div>
          <div>
            <b>Selected Faculty:</b> {routineFaculty && typeof routineFaculty === 'object' ? (routineFaculty.label || routineFaculty.value || '') : (routineFaculty || "None")}
          </div>
          <div>
            <b>Selected Days:</b> {Array.isArray(routineDays) && routineDays.length ? routineDays.map(d => (typeof d === 'object' ? (d.label || d.value || '') : String(d))).join(', ') : "None"}
          </div>
           {Object.keys(selectedFacultyByCourse).length > 0 && (
             <div>
               <b>Selected Faculty:</b> {
                 Object.entries(selectedFacultyByCourse)
                   .map(([courseCode, faculties]) => 
                    `${courseCode}: ${faculties.map(f => f && typeof f === 'object' ? (f.label || f.value || '') : String(f)).join(', ')}`
                   )
                   .join('; ')
               }
             </div>
           )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
          <GenerateButton />
          <GenerateAIButton />
          </div>
        <div style={{ fontSize: "0.9em", color: "#555", marginTop: "10px" }}>
          Using the AI for routine generation may provide a better combination of courses and times,
          and can offer feedback on the generated routine.
        </div>
        <RoutineResult />
        {/* AI Feedback/Conflict Buttons */}
        {routineResult && Array.isArray(routineResult) && routineResult.length > 0 && (
          <AIFeedbackButtons routine={routineResult} />
        )}
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ 
            marginTop: "20px", 
            padding: "10px 20px", 
            fontSize: "16px", 
            backgroundColor: "#f44336", 
            color: "white", 
            border: "none", 
            borderRadius: "4px", 
            cursor: "pointer" 
          }}
        >
          Top
        </button>
      </div>
    );
  };

  // State to manage active tab
  const [activeTab, setActiveTab] = useState('seat-status'); // Default to Seat Status

  return (
    <div className="container mt-4">
      <h1 className="usis-title">USIS Routine Generator</h1>
      {/* Bootstrap Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <a
            className={`nav-link ${activeTab === 'seat-status' ? 'active' : ''}`}
            href="#seat-status"
            onClick={(e) => { e.preventDefault(); setActiveTab('seat-status'); }}
          >
            Seat Status
          </a>
        </li>
        <li className="nav-item">
          <a
            className={`nav-link ${activeTab === 'make-routine' ? 'active' : ''}`}
            href="#make-routine"
            onClick={(e) => { e.preventDefault(); setActiveTab('make-routine'); }}
          >
            Make Routine
          </a>
        </li>
      </ul>

      {/* Tab Content */}
      <div className="tab-content">
        <div className={`tab-pane fade ${activeTab === 'seat-status' ? 'show active' : ''}`} id="seat-status">
          {/* Render SeatStatusPage component */}
          <SeatStatusPage courses={courses} />
        </div>
        <div className={`tab-pane fade ${activeTab === 'make-routine' ? 'show active' : ''}`} id="make-routine">
          {/* Render MakeRoutinePage component */}
          <MakeRoutinePage />
      </div>
      </div>
      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        marginTop: 40,
        marginBottom: 16,
        color: 'var(--tab-inactive)',
        fontSize: '1.05em',
        letterSpacing: '0.02em',
        opacity: 0.85
      }}>
        Made with <span style={{color: '#e25555', fontSize: '1.2em', verticalAlign: 'middle'}}>❤️</span> by Wasif Faisal
      </footer>
    </div>
  );
}

// --- AI Feedback/Conflict Buttons Component ---
function AIFeedbackButtons({ routine }) {
  // State to hold fetched exam schedules from API
  const [examSchedulesData, setExamSchedulesData] = useState([]);
  const [loading, setLoading] = useState({ feedback: false, exam: false, time: false, schedules: true }); // Add loading state for schedules
  const [error, setError] = useState({ feedback: '', exam: '', time: '', schedules: '' }); // Add error state for schedules
  const [result, setResult] = useState({ feedback: '', exam: '', time: '' });

  // Fetch live exam schedules data from the provided JSON URL
  useEffect(() => {
    async function fetchExamData() {
      try {
        const res = await axios.get('https://usis-cdn.eniamza.com/connect.json');
        setExamSchedulesData(res.data);
        setError(e => ({ ...e, schedules: '' })); // Clear previous error
      } catch (e) {
        console.error("Error fetching exam data from URL:", e);
        setError(e => ({ ...e, schedules: 'Failed to load exam data.' }));
        setExamSchedulesData([]); // Clear data on error
      } finally {
        setLoading(l => ({ ...l, schedules: false }));
      }
    }

    fetchExamData();

  }, []); // Empty dependency array means this runs once on mount

  // Helper to find exam data for a specific section from the fetched data
  const getExamDataForSection = (courseCode, sectionName) => {
    if (!Array.isArray(examSchedulesData) || examSchedulesData.length === 0) {
      return null; // No data or data is not an array
    }
    return examSchedulesData.find(item =>
      item.courseCode === courseCode && String(item.sectionName) === String(sectionName)
    );
  };

  // Helper to format exam date/time from the fetched data
  const formatFetchedExam = (date, start, end, room) => {
    if (date) {
      return (
        <>
          <div>{date}</div>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            {start && end ? `${formatTime12Hour(start)} - ${formatTime12Hour(end)}` : 'Time TBA'}
          </div>
          {room && (
            <div style={{ fontSize: '0.9em', color: '#666' }}>
              Room: {room}
            </div>
          )}
        </>
      );
    } else {
      return 'Not Scheduled';
    }
  };

  const handleAIRequest = async (type) => {
    setLoading(l => ({ ...l, [type]: true }));
    setError(e => ({ ...e, [type]: '' }));
    setResult(r => ({ ...r, [type]: '' }));
    let url = '';
    if (type === 'feedback') url = API_BASE + '/get_routine_feedback_ai';
    if (type === 'exam') url = API_BASE + '/check_exam_conflicts_ai';
    if (type === 'time') url = API_BASE + '/check_time_conflicts_ai';

    // When sending routine to backend for AI analysis, include necessary fields
    // Now, use the exam data found from the fetched JSON, not from the routine prop initially
    const formattedRoutine = Array.isArray(routine) ? routine.map(section => {
      const fetchedExam = getExamDataForSection(section.courseCode, section.sectionName);
      return {
        courseCode: section.courseCode,
        sectionName: section.sectionName,
        faculties: section.faculties,
        roomName: section.roomName,
        labRoomName: section.labRoomName,
        sectionSchedule: section.sectionSchedule || {},
        labSchedules: section.labSchedules || [],
        midExamDate: fetchedExam?.sectionSchedule?.midExamDate, // Use fetched data
        midExamStartTime: fetchedExam?.sectionSchedule?.midExamStartTime, // Use fetched data
        midExamEndTime: fetchedExam?.sectionSchedule?.midExamEndTime, // Use fetched data
        finalExamDate: fetchedExam?.sectionSchedule?.finalExamDate, // Use fetched data
        finalExamStartTime: fetchedExam?.sectionSchedule?.finalExamStartTime, // Use fetched data
        finalExamEndTime: fetchedExam?.sectionSchedule?.finalExamEndTime, // Use fetched data
        formattedSchedules: section.formattedSchedules || []
      };
    }) : [];

    try {
      const res = await axios.post(url, { routine: formattedRoutine });
      if (res.data.error) {
        setError(e => ({ ...e, [type]: res.data.error }));
      } else if (type === 'feedback') {
        setResult(r => ({ ...r, feedback: res.data.feedback }));
      } else if (type === 'exam') {
        setResult(r => ({ ...r, exam: res.data.analysis }));
      } else if (type === 'time') {
        setResult(r => ({ ...r, time: res.data.analysis }));
      } else {
         setError(e => ({ ...e, [type]: 'Unknown response format.' }));
      }
    } catch (err) {
      console.error(`Error in ${type} request:`, err);
      setError(e => ({ ...e, [type]: 'Failed to get AI response.' }));
    } finally {
      setLoading(l => ({ ...l, [type]: false }));
    }
  };

  return (
    <div className="ai-analysis-container">
      <h3>Exam Dates</h3>

      {/* Loading/Error state for fetching exam data */}
      {loading.schedules && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div className="loading-spinner" style={{ width: '20px', height: '20px', marginRight: '8px' }} />
          Loading exam data...
        </div>
      )}
      {error.schedules && (
        <div style={{ color: '#dc3545', textAlign: 'center', padding: '10px 0' }}>
          {error.schedules}
        </div>
      )}

      {/* Exam Dates Table (from fetched JSON data) */}
      {!loading.schedules && !error.schedules && Array.isArray(routine) && routine.length > 0 && Array.isArray(examSchedulesData) && ( // Only show table if data is loaded and routine is available
        <table className="exam-dates-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Midterm Exam</th>
              <th>Final Exam</th>
            </tr>
          </thead>
          <tbody>
            {routine.map((section, index) => {
              const fetchedExam = getExamDataForSection(section.courseCode, section.sectionName);
              return (
                <tr key={index}>
                  <td>{section.courseCode}</td>
                  <td>{section.sectionName || 'N/A'}</td>
                  <td>
                    {fetchedExam && fetchedExam.sectionSchedule ? (
                      formatFetchedExam(
                        fetchedExam.sectionSchedule.midExamDate,
                        fetchedExam.sectionSchedule.midExamStartTime,
                        fetchedExam.sectionSchedule.midExamEndTime,
                        fetchedExam.sectionSchedule.roomName // Use roomName for class exam rooms
                      )
                    ) : (
                      'Data N/A' // Or loading/error indicator per section if desired
                    )}
                  </td>
                  <td>
                    {fetchedExam && fetchedExam.sectionSchedule ? (
                      formatFetchedExam(
                        fetchedExam.sectionSchedule.finalExamDate,
                        fetchedExam.sectionSchedule.finalExamStartTime,
                        fetchedExam.sectionSchedule.finalExamEndTime,
                        fetchedExam.sectionSchedule.roomName // Use roomName for class exam rooms
                      )
                    ) : (
                      'Data N/A'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

       {/* Message when routine is empty or exam data is not available/loading */}
      {!loading.schedules && !error.schedules && (!Array.isArray(routine) || routine.length === 0 || !Array.isArray(examSchedulesData) || examSchedulesData.length === 0) && (
         <div style={{ textAlign: 'center', padding: '10px 0', color: '#6c757d' }}>
           No routine or exam data available to display.
         </div>
      )}

      {/* AI Analysis Buttons */} {/* Keep these buttons */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
        <button
          className="ai-button feedback"
          onClick={() => handleAIRequest('feedback')} 
          disabled={loading.feedback}
        >
          {loading.feedback ? (
            <>
              <div className="loading-spinner" />
              Loading...
            </>
          ) : 'Routine Feedback'}
        </button>
        <button
          className="ai-button exam"
          onClick={() => handleAIRequest('exam')} 
          disabled={loading.exam}
        >
          {loading.exam ? (
            <>
              <div className="loading-spinner" />
              Loading...
            </>
          ) : 'Check Exam Conflicts'}
        </button>
        <button
          className="ai-button time"
          onClick={() => handleAIRequest('time')} 
          disabled={loading.time}
        >
          {loading.time ? (
            <>
              <div className="loading-spinner" />
              Loading...
            </>
          ) : 'Check Time Conflicts'}
        </button>
      </div>
      {/* Results and Errors */} {/* Keep this display */}
      <div style={{ marginTop: 20 }}>
        {error.feedback && <div className="ai-result feedback">{error.feedback}</div>}
        {result.feedback && <div className="ai-result feedback">{result.feedback}</div>}
        {error.exam && <div className="ai-result exam">{error.exam}</div>}
        {result.exam && <div className="ai-result exam">{result.exam}</div>}
        {error.time && <div className="ai-result time">{error.time}</div>}
        {result.time && <div className="ai-result time">{result.time}</div>}
      </div>
    </div>
  );
}

export default App;
