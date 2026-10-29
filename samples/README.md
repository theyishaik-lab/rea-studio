# Samples

Tiny files made for REA Studio's demo. Build the binaries with:

```sh
mkdir -p build
cc -O1 -o build/hello hello.c
python3 -c "import py_compile; py_compile.compile('greet.py', cfile='build/greet.pyc')"
```

`npm run record-demo` does this for you and records REA's real answers into `src/demo/`.
