export default function retry<T>(process: () => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    const getTimeout = (a: number) => a * 1000;
    return new Promise((resolve, reject) => {
        let currentAttempt = 0;
        const doAttempt = () => {
            currentAttempt += 1;
            process()
                .then(resolve)
                .catch((error) => {
                    if (currentAttempt >= maxAttempts) {
                        reject(error);
                    } else {
                        setTimeout(doAttempt, getTimeout(currentAttempt));
                    }
                });
        };
        doAttempt();
    });
}