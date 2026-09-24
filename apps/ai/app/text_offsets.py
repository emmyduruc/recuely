"""UTF-16 offsets (SPEC.md §B5 rule 1).

Contracts count text positions in UTF-16 code units, as JavaScript string indices do. Python strings
index code points, so every offset crossing the boundary goes through these helpers.
"""

_BMP_LIMIT = 0xFFFF


def _units(char: str) -> int:
    return 2 if ord(char) > _BMP_LIMIT else 1


def utf16_length(text: str) -> int:
    return sum(_units(char) for char in text)


def index_to_utf16(text: str, index: int) -> int:
    """Code-point index → UTF-16 offset."""
    if not 0 <= index <= len(text):
        raise ValueError(f"index {index} is outside the text")
    return utf16_length(text[:index])


def utf16_to_index(text: str, offset: int) -> int:
    """UTF-16 offset → code-point index. An offset inside a surrogate pair is rejected."""
    position = 0
    for index, char in enumerate(text):
        if position == offset:
            return index
        position += _units(char)
        if position > offset:
            raise ValueError(f"offset {offset} splits a surrogate pair")
    if position == offset:
        return len(text)
    raise ValueError(f"offset {offset} is outside the text")


def slice_utf16(text: str, start: int, end: int) -> str:
    return text[utf16_to_index(text, start) : utf16_to_index(text, end)]
