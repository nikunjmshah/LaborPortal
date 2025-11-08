/* Storage and data layer for LaborPortal (public build) */
(function () {
  const JOBS_KEY = "lp_jobs";
  const SESSION_KEY = "lp_session";
  const RECRUITER_EMAIL_KEY = "lp_recruiter_email";
  const RECRUITER_PASS_HASH_KEY = "lp_recruiter_pass_hash";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function generateId() {
    return "job_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function normalizeApplicants(arr) {
    return (arr || []).map(a => {
      if (typeof a === "string") {
        return { id: generateId(), name: a, user: a, contact: "", appliedAt: new Date().toISOString() };
      }
      if (a && typeof a === "object") {
        return {
          id: a.id || generateId(),
          name: a.name || a.user || "Unknown",
          user: a.user || "",
          contact: a.contact || "",
          appliedAt: a.appliedAt || new Date().toISOString()
        };
      }
      return { id: generateId(), name: "Unknown", user: "", contact: "", appliedAt: new Date().toISOString() };
    });
  }
  function ensureSeedData() {
    const existingJobs = readJson(JOBS_KEY, null);
    if (!existingJobs) {
      writeJson(JOBS_KEY, [
        { id: generateId(), title: "Warehouse Loader", description: "Assist with loading/unloading inventory. Lift up to 50 lbs.", pricePerHour: 220, requiredCount: 5, createdBy: "recruiter@demo.com", applicants: [], createdAt: new Date().toISOString(), location: "Mumbai", startDateTime: new Date(Date.now() + 86400000).toISOString() },
        { id: generateId(), title: "General Construction", description: "Site cleanup and material handling. Safety gear provided.", pricePerHour: 250, requiredCount: 10, createdBy: "recruiter@demo.com", applicants: [], createdAt: new Date().toISOString(), location: "Pune", startDateTime: new Date(Date.now() + 172800000).toISOString() }
      ]);
    }
    if (window.LPData && typeof LPData.getLaborerRegistry === "function") {
      LPData.getLaborerRegistry(); // ensures it exists
    }
  }
  function getJobs() { return readJson(JOBS_KEY, []); }
  function setJobs(jobs) { writeJson(JOBS_KEY, jobs); }
  function getSession() { return readJson(SESSION_KEY, null); }
  function setSession(session) { writeJson(SESSION_KEY, session); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  async function sha256(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function verifyOrSetupRecruiter(email, password) {
    ensureSeedData();
    const storedHash = localStorage.getItem(RECRUITER_PASS_HASH_KEY);
    const storedEmail = localStorage.getItem(RECRUITER_EMAIL_KEY);
    const passHash = await sha256(password);
    if (!storedHash) {
      localStorage.setItem(RECRUITER_EMAIL_KEY, String(email || "").trim());
      localStorage.setItem(RECRUITER_PASS_HASH_KEY, passHash);
      const session = { username: String(email || "recruiter").trim(), role: "recruiter", name: "Recruiter" };
      setSession(session);
      return { ok: true, session, setup: true };
    }
    if (storedEmail && String(email || "").trim() !== storedEmail) {
      return { ok: false, error: "Email does not match configured recruiter" };
    }
    if (storedHash !== passHash) {
      return { ok: false, error: "Invalid password" };
    }
    const session = { username: storedEmail || "recruiter", role: "recruiter", name: "Recruiter" };
    setSession(session);
    return { ok: true, session };
  }
  function requireRole(expectedRole) {
    const session = getSession();
    if (!session) return { ok: false, reason: "no_session" };
    if (expectedRole && session.role !== expectedRole) return { ok: false, reason: "wrong_role" };
    return { ok: true, session };
  }
  function logout() { clearSession(); }

  function loginLabor(name, contact, passkey) {
    ensureSeedData();
    if (!name || !contact) return { ok: false, error: "Missing name or contact" };
    if ((passkey || "") !== "1234") return { ok: false, error: "Invalid passkey" };
    if (!/^\d{10}$/.test(String(contact).trim())) return { ok: false, error: "Contact must be 10 digits" };
    const reg = window.LPData ? LPData.getLaborerRegistry() : {};
    const c = String(contact).trim();
    const existing = reg[c];
    if (existing && existing.name && existing.name !== String(name).trim()) {
      return { ok: false, error: "Contact already registered with a different name" };
    }
    reg[c] = existing || { name: String(name).trim(), contact: c, createdAt: new Date().toISOString() };
    if (window.LPData) LPData.setLaborerRegistry(reg);
    const session = { username: c, role: "laborer", name: String(name).trim(), contact: c };
    setSession(session);
    return { ok: true, session };
  }

  function addJob({ title, description, pricePerHour, requiredCount, createdBy, location, startDateTime }) {
    const jobs = getJobs();
    const job = { id: generateId(), title: title.trim(), description: description.trim(), pricePerHour: Number(pricePerHour), requiredCount: Number(requiredCount), createdBy, applicants: [], createdAt: new Date().toISOString(), location: (location || "").trim(), startDateTime: startDateTime || "" };
    jobs.unshift(job);
    setJobs(jobs);
    return job;
  }
  function deleteJob(id, byUser) {
    const jobs = getJobs();
    const idx = jobs.findIndex(j => j.id === id);
    if (idx === -1) return false;
    if (jobs[idx].createdBy !== byUser) return false;
    jobs.splice(idx, 1);
    setJobs(jobs);
    return true;
  }
  function applyToJobWithDetails(jobId, applicant) {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: "Job not found" };
    if (!applicant || !applicant.name || !applicant.contact) return { ok: false, error: "Missing required details" };
    if (!/^\d{10}$/.test(String(applicant.contact).trim())) return { ok: false, error: "Contact must be 10 digits" };
    if ((applicant.passkey || "") !== "1234") return { ok: false, error: "Invalid passkey" };
    job.applicants = normalizeApplicants(job.applicants);
    if (job.applicants.length >= job.requiredCount) return { ok: false, error: "Job filled" };
    if (job.applicants.some(a => a.contact && a.contact === applicant.contact)) return { ok: false, error: "You already signed up" };
    job.applicants.push({ id: generateId(), name: applicant.name.trim(), user: "", contact: applicant.contact.trim(), appliedAt: new Date().toISOString() });
    setJobs(jobs);
    return { ok: true, job };
  }
  function unapplyFromJobByContact(jobId, contact) {
    const jobs = getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: "Job not found" };
    job.applicants = normalizeApplicants(job.applicants).filter(a => a.contact !== String(contact).trim());
    setJobs(jobs);
    return { ok: true, job };
  }
  function getJobsForRecruiter(username) {
    return getJobs().map(j => ({ ...j, applicants: normalizeApplicants(j.applicants) })).filter(j => j.createdBy === username);
  }
  function getOpenJobs() {
    return getJobs().map(j => ({ ...j, applicants: normalizeApplicants(j.applicants) })).filter(j => j.applicants.length < j.requiredCount);
  }
  function getJobsForLaborer(username) {
    return getJobs().map(j => ({ ...j, applicants: normalizeApplicants(j.applicants) })).filter(j => j.applicants.some(a => a.user === username || a.contact === username));
  }
  window.LPStorage = {
    ensureSeedData,
    getJobs, setJobs,
    getSession, setSession, clearSession,
    loginLabor, logout, requireRole,
    verifyOrSetupRecruiter,
    addJob, deleteJob,
    applyToJobWithDetails,
    unapplyFromJobByContact,
    getJobsForRecruiter, getOpenJobs, getJobsForLaborer
  };
})();


