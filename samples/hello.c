/* A tiny program used as REA Studio's demo sample. Build: cc -O1 -o build/hello hello.c */
#include <stdio.h>
#include <string.h>

int parse_mode(const char *arg) { return strcmp(arg, "--verbose") == 0; }

__attribute__((visibility("default"))) int rea_studio_add(int a, int b) { return a + b; }

int main(int argc, char **argv) {
  int verbose = argc > 1 && parse_mode(argv[1]);
  printf("Hello from REA Studio%s\n", verbose ? " (verbose)" : "");
  printf("2 + 3 = %d\n", rea_studio_add(2, 3));
  return 0;
}
