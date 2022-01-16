const storage: Storage = process.env.NODE_ENV !== "production" && process.env.REACT_APP_USE_SESSION_STORAGE === "true" ? sessionStorage : localStorage;

export default storage;
