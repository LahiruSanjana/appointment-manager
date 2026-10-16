export const TYPES = ['Consultation', 'Follow-up', 'Checkup', 'Lab Review', 'Vaccination'];
export const STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No-show'];
export const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export const toLocalInput = (d) => new Date(new Date(d) - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
