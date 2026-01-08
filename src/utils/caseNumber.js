export const generateCaseNumber = (date, counter) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const counterStr = String(counter).padStart(4, '0');
  return `CASE-${year}${month}${day}-${counterStr}`;
};

