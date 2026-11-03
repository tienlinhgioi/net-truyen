/// Lịch sử các tab đã xem, để nút Back quay về tab trước đó.
class TabHistory {
  TabHistory(this.current);

  int current;
  final List<int> _stack = [];

  /// Chuyển sang tab [i] (nhớ tab đang xem để Back quay lại).
  void select(int i) {
    if (i == current) return;
    _stack.remove(i); // tránh vòng lặp A -> B -> A -> B
    _stack.add(current);
    current = i;
  }

  /// Quay về tab trước. Trả về null nếu không còn (lúc đó nên thoát app).
  int? back() {
    if (_stack.isEmpty) return null;
    current = _stack.removeLast();
    return current;
  }
}
