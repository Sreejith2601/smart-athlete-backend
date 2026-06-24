/**
 * Date Engine: Calculates current training day index in the 28-day cycle.
 */

const getTrainingDate = (startDate) => {
  const start = new Date(startDate);
  const today = new Date();
  
  // Normalize dates to midnight to ensure accurate day diff
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffInMs = today - start;
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  // Handle cases before startDate
  if (diffInDays < 0) {
    return {
      weekIndex: 1,
      dayIndexInWeek: 0,
      dayName: "Monday",
      dayTotalIndex: 0
    };
  }

  const dayTotalIndex = diffInDays % 28;
  const weekIndex = Math.floor(dayTotalIndex / 7) + 1;
  const dayIndexInWeek = dayTotalIndex % 7;

  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  return {
    weekIndex,
    dayIndexInWeek,
    dayName: dayNames[dayIndexInWeek],
    dayTotalIndex
  };
};

module.exports = {
  getTrainingDate
};
