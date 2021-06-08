class Matrix {
    readonly n: number;
    private v: Array<number>;

    constructor(n: number) {
        this.n = n;
        this.v = arrayFill(new Array(n * n), 0);
    }

    getValueAt(row: number, col: number) {
        return this.v[row * this.n + col];
    }

    setValueAt(row: number, col: number, value: number) {
        this.v[row * this.n + col] = value;
    }

    toString() {
        let s = '';
        for (let i = 0; i < this.n; ++i) {
            s += this.v.slice(i * this.n, (i + 1) * this.n)
                .map(o => {
                    const val = String(o);
                    return "   ".substr(0, 3 - val.length) + val;
                })
                .join('') + '\n';
        }
        return s;
    }
}

function arrayFill(array: Array<any>, value: any): Array<any> {
    for (let i = 0; i < array.length; ++i) {
        array[i] = value;
    }
    return array;
}

function dfs(v: number, used: Array<boolean>, matching: Array<number>, n: number, hasEdge: (v1: number, v2: number) => boolean) {
	if (used[v]) {
        return false;
    }
	used[v] = true;
	for (let i = 0; i < n; ++i) {
		if (hasEdge(v, i) && (matching[i] === -1 || dfs(matching[i], used, matching, n, hasEdge))) {
			matching[i] = v;
			return true;
		}
	}
	return false;
}

function kuhn(n: number, hasEdge: (v1: number, v2: number) => boolean): Array<number> {
    const matching = arrayFill(new Array<number>(n), -1);
    const used = arrayFill(new Array<boolean>(n), false);

    // trying to make random greedy matching
    const usedGreedy = arrayFill(new Array<boolean>(n), false);
    const rnd = new Array<number>(n);
    let rndLength = 0;
    for (let i = 0; i < n; ++i) {
        rndLength = 0;
        for (let j = 0; j < n; ++j) {
            if (hasEdge(i, j) && matching[j] == -1) {
                rnd[rndLength++] = j;
            }
        }
        if (rndLength > 0) {
            matching[rnd[Math.floor(Math.random() * rndLength)]] = i;
            usedGreedy[i] = true;
        }
    }

    for (let v = 0; v < n; ++v) {
        if (!usedGreedy[v]) {
            arrayFill(used, false);
		    dfs(v, used, matching, n, hasEdge);
        }
	}
 
	return matching;
}

/**
 * Returns "random" matrix.
 * 
 * @param {number} n Number of players
 * @returns {Matrix} "Random" matrix
 */
function genRandomMatrix(n: number): Matrix {
    const m = new Matrix(n);

    // fill first step
    for (let i = 0; i < n; ++i) {
        m.setValueAt(i, i, 1);
    }

    // fill other steps
    const hasEdge = (v1: number, v2: number) => m.getValueAt(v1, v2) === 0;
    for(let step = 2; step <= n; ++step) {
        const matching = kuhn(m.n, hasEdge);

        for (let i = 0; i < n; ++i) {
            if (matching[i] !== -1) {
                m.setValueAt(matching[i], i, step);
            }
        }
    }

    // convert matrix
    const m2 = new Matrix(n);
    for (let i = 0; i < n; ++i) {
        for (let j = 0; j < n; ++j) {
            m2.setValueAt(m.getValueAt(i, j) - 1, j, i);
        }
    }

    return m2;
}